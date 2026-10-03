import type { JevPayoutDecision, Job } from "../types";
import {
  postSystemOne,
  resolveJevApiKey,
  resolveModel,
  resolveSystemOneUrl,
  type SystemOneRequest,
} from "./systemone";

const CHOICE_ID = "payout_gate";
const DISPUTE_ID = "payout_dispute";

/**
 * Minimum Choice confidence that may continue into the existing payout path.
 * Move this when the floor should change; callers compare against it directly.
 */
export const PAYOUT_CONFIDENCE_FLOOR = 0.85;

/**
 * Dispute Noul at or above this value holds the payout.
 * The number is P(the note disputes, changes, or fails to support the payout).
 */
export const PAYOUT_DISPUTE_NOUL = 0.5;

/**
 * Narrow text gate. Jev does not send the payout, does not compute the amount,
 * and is not the legal or financial judgment. PayPal runs only when the Choice
 * is approve, confidence meets the floor, and the dispute Noul is below 0.5.
 */
const PAYOUT_CHOICE = {
  type: "choice" as const,
  instructions:
    "You are a narrow text gate in front of an existing payout path. You do not send money, you do not compute or replace the amount, and you are not the legal or financial judgment. Read only the written payout request. Choose approve when it names who is paid, a positive amount, and a reason. Choose hold when who, amount, or reason is missing or unclear, or when a person should review the request before that path runs.",
  criteria: {
    approve:
      "The request names a recipient, a positive amount as written, and a reason. Approving only lets the existing payout path continue. It does not send the payout and it is not a legal judgment.",
    hold: "The request is incomplete or unclear, or a person should review it. Holding stops the payout.",
  },
};

const PAYOUT_DISPUTE = {
  type: "noul" as const,
  instructions:
    "Does this written note dispute, change, or fail to support this payout? Read only the note as written. Do not compute or replace the amount. Do not write a legal judgment. Yes does not send money.",
  criteria: {
    true: "The note disputes this payout, changes who is paid or the amount, or fails to support the payout as written.",
    false: "The note does not dispute, change, or fail to support this payout as written.",
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
    questions: { [CHOICE_ID]: PAYOUT_CHOICE, [DISPUTE_ID]: PAYOUT_DISPUTE },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type ParsedPayoutChoice = {
  model: string | null;
  choice: string;
  confidence: number | null;
  /** Null when the dispute Noul is absent. An unusable Noul throws. */
  noul: number | null;
  probabilities: Record<string, number> | null;
};

function readDisputeNoul(answers: Record<string, unknown>): number | null {
  if (!(DISPUTE_ID in answers)) return null;
  const answer = answers[DISPUTE_ID];
  if (!isRecord(answer) || answer.type !== "noul" || typeof answer.noul !== "number" || !Number.isFinite(answer.noul)) {
    throw new Error("Jev payout_dispute was not a noul");
  }
  return answer.noul;
}

/** Accept the flat System One body jobproof parses, or a `result` envelope. */
export function parsePayoutChoice(raw: unknown): ParsedPayoutChoice {
  if (!isRecord(raw)) throw new Error("Jev response was not an object");
  const body =
    isRecord(raw.result) && (isRecord(raw.result.answers) || typeof raw.result.model === "string")
      ? raw.result
      : raw;
  if (!isRecord(body.answers)) throw new Error("Jev response is missing answers");
  const answer = body.answers[CHOICE_ID];
  if (!isRecord(answer)) throw new Error("Jev response is missing payout_gate");
  if (answer.type !== "choice" || typeof answer.choice !== "string" || !answer.choice.trim()) {
    throw new Error("Jev payout_gate was not a choice");
  }
  const probabilities = isRecord(answer.probabilities)
    ? Object.fromEntries(
        Object.entries(answer.probabilities).filter((entry): entry is [string, number] => typeof entry[1] === "number"),
      )
    : null;
  const confidence = typeof answer.confidence === "number" && Number.isFinite(answer.confidence) ? answer.confidence : null;
  return {
    model: typeof body.model === "string" ? body.model : null,
    choice: answer.choice.trim(),
    confidence,
    noul: readDisputeNoul(body.answers),
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
    noul: partial.noul,
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
        noul: null,
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
    const shared = {
      model: parsed.model,
      choice: parsed.choice,
      confidence: parsed.confidence,
      noul: parsed.noul,
      probabilities: parsed.probabilities,
    };
    if (parsed.choice !== "approve") {
      const note =
        parsed.choice === "hold"
          ? "Jev chose hold. The PayPal payout was not created."
          : `Jev returned "${parsed.choice}" instead of approve. The PayPal payout was not created.`;
      return decisionBase({ ...shared, decision: "hold", note }, now);
    }
    if (parsed.confidence == null || parsed.confidence < PAYOUT_CONFIDENCE_FLOOR) {
      return decisionBase(
        {
          ...shared,
          decision: "hold",
          note: `Jev chose approve but confidence does not meet ${PAYOUT_CONFIDENCE_FLOOR}. The PayPal payout was not created.`,
        },
        now,
      );
    }
    if (parsed.noul == null || parsed.noul < 0 || parsed.noul >= PAYOUT_DISPUTE_NOUL) {
      const disputed = parsed.noul != null && parsed.noul >= PAYOUT_DISPUTE_NOUL;
      return decisionBase(
        {
          ...shared,
          decision: "hold",
          note: disputed
            ? "The written note disputes, changes, or fails to support this payout. The PayPal payout was not created."
            : "Jev did not return a usable dispute check. The PayPal payout was not created.",
        },
        now,
      );
    }
    return decisionBase(
      {
        ...shared,
        decision: "approve",
        note: "Jev chose approve with confidence at or above the floor, and the note does not dispute this payout. That does not send money and is not a legal judgment. The existing PayPal payout path may continue.",
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
        noul: null,
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
 * An approve Choice is not a payout. `sendPayout` is the PayPal call, and it
 * runs only when confidence meets the floor and the note does not dispute.
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
