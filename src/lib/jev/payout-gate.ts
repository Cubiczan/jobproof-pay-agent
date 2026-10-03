import type { JevPayoutDecision, Job } from "../types";
import {
  postSystemOne,
  resolveJevApiKey,
  resolveModel,
  resolveSystemOneUrl,
  type SystemOneRequest,
} from "./systemone";

const QUESTION_ID = "payout_gate";

/**
 * Narrow text gate. Jev does not send the payout and is not the legal or
 * financial judgment. Only an explicit approve Choice may continue into PayPal.
 */
const PAYOUT_CHOICE = {
  type: "choice" as const,
  instructions:
    "You are a narrow text gate in front of an existing payout path. You do not send money, and you are not the legal or financial judgment. Read only the written payout request. Choose approve when it names who is paid, a positive amount, and a reason. Choose hold when who, amount, or reason is missing or unclear, or when a person should review the request before that path runs.",
  criteria: {
    approve:
      "The request names a recipient, a positive amount, and a reason. Approving only lets the existing payout path continue. It does not send the payout.",
    hold: "The request is incomplete or unclear, or a person should review it. Holding stops the payout.",
  },
};

export function writtenPayoutRequest(job: Pick<Job, "contractorName" | "contractorEmail" | "amount" | "currency" | "title" | "description">): string {
  const who = [job.contractorName?.trim(), job.contractorEmail?.trim()].filter(Boolean).join(" ");
  const amount = `${Number(job.amount).toFixed(2)} ${job.currency || "USD"}`;
  const reason = [job.title, job.description]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join(" — ");
  return `Who: ${who}\nAmount: ${amount}\nReason: ${reason}`;
}

export function buildPayoutGateRequest(
  job: Pick<Job, "contractorName" | "contractorEmail" | "amount" | "currency" | "title" | "description">,
  model: string,
): SystemOneRequest {
  return {
    model,
    state: writtenPayoutRequest(job),
    questions: { [QUESTION_ID]: PAYOUT_CHOICE },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type ParsedPayoutChoice = {
  model: string | null;
  choice: string;
  confidence: number | null;
  probabilities: Record<string, number> | null;
};

/** Accept the flat System One body jobproof parses, or a `result` envelope. */
export function parsePayoutChoice(raw: unknown): ParsedPayoutChoice {
  if (!isRecord(raw)) throw new Error("Jev response was not an object");
  const body =
    isRecord(raw.result) && (isRecord(raw.result.answers) || typeof raw.result.model === "string")
      ? raw.result
      : raw;
  if (!isRecord(body.answers)) throw new Error("Jev response is missing answers");
  const answer = body.answers[QUESTION_ID];
  if (!isRecord(answer)) throw new Error("Jev response is missing payout_gate");
  if (answer.type !== "choice" || typeof answer.choice !== "string" || !answer.choice.trim()) {
    throw new Error("Jev payout_gate was not a choice");
  }
  const probabilities = isRecord(answer.probabilities)
    ? Object.fromEntries(
        Object.entries(answer.probabilities).filter((entry): entry is [string, number] => typeof entry[1] === "number"),
      )
    : null;
  const confidence = typeof answer.confidence === "number" ? answer.confidence : null;
  return {
    model: typeof body.model === "string" ? body.model : null,
    choice: answer.choice.trim(),
    confidence,
    probabilities: probabilities && Object.keys(probabilities).length > 0 ? probabilities : null,
  };
}

export type GateOptions = {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => Date;
};

function decisionBase(partial: Omit<JevPayoutDecision, "payoutAttempted" | "evaluatedAt"> & { evaluatedAt?: string }, now: Date): JevPayoutDecision {
  return {
    payoutAttempted: false,
    evaluatedAt: partial.evaluatedAt ?? now.toISOString(),
    decision: partial.decision,
    model: partial.model,
    choice: partial.choice,
    confidence: partial.confidence,
    probabilities: partial.probabilities,
    note: partial.note,
  };
}

/**
 * Ask Jev, or skip when no key is configured.
 * Does not create a payout.
 */
export async function reviewPayoutGate(job: Job, options: GateOptions = {}): Promise<JevPayoutDecision> {
  const env = options.env ?? (process.env as Record<string, string | undefined>);
  const now = options.now?.() ?? new Date();
  const apiKey = resolveJevApiKey(env);
  if (!apiKey) {
    return decisionBase(
      {
        decision: "skipped",
        model: null,
        choice: null,
        confidence: null,
        probabilities: null,
        note: "JEV_API_KEY is unset, so Jev was not called. The existing payout path continues.",
      },
      now,
    );
  }

  const request = buildPayoutGateRequest(job, resolveModel(env));
  try {
    const raw = await postSystemOne(request, {
      apiKey,
      url: resolveSystemOneUrl(env),
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs,
    });
    const parsed = parsePayoutChoice(raw);
    if (parsed.choice === "approve") {
      return decisionBase(
        {
          decision: "approve",
          model: parsed.model,
          choice: parsed.choice,
          confidence: parsed.confidence,
          probabilities: parsed.probabilities,
          note: "Jev chose approve. That does not send money. The existing PayPal payout path may continue.",
        },
        now,
      );
    }
    if (parsed.choice === "hold") {
      return decisionBase(
        {
          decision: "hold",
          model: parsed.model,
          choice: parsed.choice,
          confidence: parsed.confidence,
          probabilities: parsed.probabilities,
          note: "Jev chose hold. The PayPal payout was not created.",
        },
        now,
      );
    }
    return decisionBase(
      {
        decision: "hold",
        model: parsed.model,
        choice: parsed.choice,
        confidence: parsed.confidence,
        probabilities: parsed.probabilities,
        note: `Jev returned "${parsed.choice}" instead of approve. The PayPal payout was not created.`,
      },
      now,
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Jev request failed";
    return decisionBase(
      {
        decision: "hold",
        model: null,
        choice: null,
        confidence: null,
        probabilities: null,
        note: `Jev did not return an approve choice (${detail}). The PayPal payout was not created.`,
      },
      now,
    );
  }
}

export class PayoutAfterGateError extends Error {
  gate: JevPayoutDecision;

  constructor(message: string, gate: JevPayoutDecision) {
    super(message);
    this.name = "PayoutAfterGateError";
    this.gate = gate;
  }
}

export type PayoutGateOutcome<T> =
  | { held: true; gate: JevPayoutDecision; payout: null }
  | { held: false; gate: JevPayoutDecision; payout: T };

/**
 * Run the gate, then the existing payout function only when the gate allows it.
 * An approve Choice is not a payout. `sendPayout` is the PayPal call.
 */
export async function payoutAfterJevGate<T>(
  job: Job,
  sendPayout: (job: Job) => Promise<T>,
  options: GateOptions = {},
): Promise<PayoutGateOutcome<T>> {
  const gate = await reviewPayoutGate(job, options);
  if (gate.decision === "hold") {
    return { held: true, gate, payout: null };
  }
  const attempted: JevPayoutDecision = { ...gate, payoutAttempted: true };
  try {
    const payout = await sendPayout(job);
    return { held: false, gate: attempted, payout };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Payout failed";
    throw new PayoutAfterGateError(message, attempted);
  }
}
