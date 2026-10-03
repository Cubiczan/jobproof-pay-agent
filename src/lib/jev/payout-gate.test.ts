import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Job } from "../types";
import {
  PAYOUT_CONFIDENCE_FLOOR,
  PAYOUT_DISPUTE_NOUL,
  buildPayoutGateRequest,
  parsePayoutChoice,
  payoutAfterJevGate,
  writtenPayoutRequest,
} from "./payout-gate";
import { DEFAULT_SYSTEMONE_URL } from "./systemone";

function sampleJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    title: "Kitchen backsplash",
    description: "Replaced tile and grout",
    contractorEmail: "ada@example.com",
    contractorName: "Ada Lovelace",
    amount: 125,
    currency: "USD",
    beforeImageUrl: "https://cdn.example/before.jpg",
    afterImageUrl: "/uploads/after.png",
    paymentStatus: "paid",
    createdAt: "2026-10-03T00:00:00.000Z",
    updatedAt: "2026-10-03T00:00:00.000Z",
    ...overrides,
  };
}

function choiceBody(
  choice: string,
  options: { envelope?: boolean; confidence?: number; noul?: number | null } = {},
) {
  const confidence = options.confidence ?? 0.84;
  const noul = options.noul === undefined ? 0.12 : options.noul;
  const answers: Record<string, unknown> = {
    payout_gate: {
      type: "choice",
      choice,
      probabilities: { approve: choice === "approve" ? 0.91 : 0.09, hold: choice === "hold" ? 0.91 : 0.09 },
      confidence,
    },
  };
  if (noul !== null) {
    answers.payout_dispute = { type: "noul", noul };
  }
  const body = {
    model: "jev-1.13.0",
    answers,
    usage: { input_tokens: 42, output_tokens: 8 },
  };
  return options.envelope ? { result: body } : body;
}

type Seen = { calls: number; url: string; auth: string; body: unknown };
type MockMode = "pay" | "hold" | "error" | "envelope-hold" | "low-confidence" | "dispute";

function responseFor(mode: MockMode): { status: number; json: unknown } {
  if (mode === "error") return { status: 500, json: null };
  if (mode === "low-confidence") {
    return { status: 200, json: choiceBody("approve", { confidence: PAYOUT_CONFIDENCE_FLOOR - 0.01, noul: 0.12 }) };
  }
  if (mode === "dispute") {
    return { status: 200, json: choiceBody("approve", { confidence: 0.91, noul: PAYOUT_DISPUTE_NOUL }) };
  }
  if (mode === "pay") {
    return { status: 200, json: choiceBody("approve", { confidence: 0.91, noul: 0.12 }) };
  }
  return {
    status: 200,
    json: choiceBody("hold", { envelope: mode === "envelope-hold", confidence: 0.91, noul: 0.12 }),
  };
}

function mockFetch(mode: MockMode, seen: Seen): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    seen.calls += 1;
    seen.url = String(url);
    seen.auth = new Headers(init?.headers).get("Authorization") ?? "";
    seen.body = JSON.parse(String(init?.body));
    const response = responseFor(mode);
    if (response.status !== 200) return new Response("nope", { status: response.status });
    return new Response(JSON.stringify(response.json), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

describe("payout gate", () => {
  it("keeps the existing payout path when JEV_API_KEY is missing", async () => {
    const seen: Seen = { calls: 0, url: "", auth: "", body: null };
    let payoutCalls = 0;
    const outcome = await payoutAfterJevGate(
      sampleJob(),
      async (job) => {
        payoutCalls += 1;
        return { batchId: `PAYPAL-${job.id}`, status: "PENDING" };
      },
      {
        env: {},
        fetchImpl: mockFetch("hold", seen),
        now: () => new Date("2026-10-03T12:00:00.000Z"),
      },
    );

    assert.equal(seen.calls, 0);
    assert.equal(payoutCalls, 1);
    assert.equal(outcome.held, false);
    if (outcome.held) return;
    assert.equal(outcome.gate.decision, "skipped");
    assert.equal(outcome.gate.payoutAttempted, true);
    assert.equal(outcome.payout.batchId, "PAYPAL-job-1");
  });

  it("treats a blank key as unset and does not call Jev", async () => {
    const seen: Seen = { calls: 0, url: "", auth: "", body: null };
    let payoutCalls = 0;
    const outcome = await payoutAfterJevGate(
      sampleJob(),
      async () => {
        payoutCalls += 1;
        return { batchId: "PAYPAL-BLANK", status: "PENDING" };
      },
      { env: { JEV_API_KEY: "   " }, fetchImpl: mockFetch("hold", seen) },
    );
    assert.equal(seen.calls, 0);
    assert.equal(payoutCalls, 1);
    assert.equal(outcome.held, false);
  });

  it("holds the payout when Jev chooses hold and does not call PayPal", async () => {
    const seen: Seen = { calls: 0, url: "", auth: "", body: null };
    let payoutCalls = 0;
    const outcome = await payoutAfterJevGate(
      sampleJob(),
      async () => {
        payoutCalls += 1;
        return { batchId: "SHOULD-NOT-EXIST", status: "PENDING" };
      },
      {
        env: { JEV_API_KEY: "test-key" },
        fetchImpl: mockFetch("hold", seen),
      },
    );

    assert.equal(payoutCalls, 0);
    assert.equal(outcome.held, true);
    assert.equal(outcome.payout, null);
    assert.equal(outcome.gate.decision, "hold");
    assert.equal(outcome.gate.choice, "hold");
    assert.equal(outcome.gate.payoutAttempted, false);
    assert.equal(outcome.gate.model, "jev-1.13.0");
    assert.equal(seen.calls, 1);
    assert.equal(seen.url, DEFAULT_SYSTEMONE_URL);
    assert.equal(seen.auth, "Bearer test-key");

    const body = seen.body as {
      model: string;
      state: string;
      questions: {
        payout_gate: { type: string; criteria: Record<string, string> };
        payout_dispute: { type: string; criteria: { true: string; false: string } };
      };
    };
    assert.equal(body.model, "jev-latest");
    assert.equal(seen.calls, 1);
    assert.deepEqual(Object.keys(body.questions).sort(), ["payout_dispute", "payout_gate"]);
    assert.equal(body.questions.payout_gate.type, "choice");
    assert.deepEqual(Object.keys(body.questions.payout_gate.criteria).sort(), ["approve", "hold"]);
    assert.equal(body.questions.payout_dispute.type, "noul");
    assert.match(body.state, /Who: Ada Lovelace ada@example.com/);
    assert.match(body.state, /Amount: 125\.00 USD/);
    assert.match(body.state, /Reason: Kitchen backsplash — Replaced tile and grout/);
    assert.equal(body.state.includes("before.jpg"), false);
    assert.equal(body.state.includes("/uploads/after.png"), false);
    assert.equal(JSON.stringify(body).includes("test-key"), false);
  });

  it("pays on approve when confidence is high and the dispute Noul is low", async () => {
    const seen: Seen = { calls: 0, url: "", auth: "", body: null };
    const events: string[] = [];
    const outcome = await payoutAfterJevGate(
      sampleJob(),
      async (job) => {
        events.push(`paypal:${job.contractorEmail}:${job.amount}`);
        return { batchId: "FROM-PAYPAL", status: "PENDING" };
      },
      {
        env: { JEV_API_KEY: "test-key", JEV_API_URL: "https://api.typesafe.ai/v1/systemone" },
        fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
          events.push("jev");
          return mockFetch("pay", seen)(url, init);
        }) as typeof fetch,
      },
    );

    assert.deepEqual(events, ["jev", "paypal:ada@example.com:125"]);
    assert.equal(outcome.held, false);
    if (outcome.held) return;
    assert.equal(outcome.gate.decision, "approve");
    assert.equal(outcome.gate.confidence, 0.91);
    assert.equal(outcome.gate.noul, 0.12);
    assert.equal(outcome.gate.payoutAttempted, true);
    assert.equal(outcome.payout.batchId, "FROM-PAYPAL");
    assert.equal(seen.calls, 1);
    assert.equal(seen.url, "https://api.typesafe.ai/v1/systemone");
  });

  it("pays when confidence is exactly the floor and the dispute Noul is below 0.5", async () => {
    let payoutCalls = 0;
    const outcome = await payoutAfterJevGate(
      sampleJob(),
      async () => {
        payoutCalls += 1;
        return { batchId: "FROM-PAYPAL", status: "PENDING" };
      },
      {
        env: { JEV_API_KEY: "test-key" },
        fetchImpl: (async () =>
          new Response(
            JSON.stringify(choiceBody("approve", { confidence: PAYOUT_CONFIDENCE_FLOOR, noul: PAYOUT_DISPUTE_NOUL - 0.01 })),
            { status: 200, headers: { "Content-Type": "application/json" } },
          )) as typeof fetch,
      },
    );
    assert.equal(payoutCalls, 1);
    assert.equal(outcome.held, false);
  });

  it("holds an approve when confidence is below the floor", async () => {
    const seen: Seen = { calls: 0, url: "", auth: "", body: null };
    let payoutCalls = 0;
    const outcome = await payoutAfterJevGate(
      sampleJob(),
      async () => {
        payoutCalls += 1;
        return { batchId: "NO", status: "PENDING" };
      },
      { env: { JEV_API_KEY: "test-key" }, fetchImpl: mockFetch("low-confidence", seen) },
    );
    assert.equal(seen.calls, 1);
    assert.equal(payoutCalls, 0);
    assert.equal(outcome.held, true);
    assert.equal(outcome.gate.decision, "hold");
    assert.equal(outcome.gate.choice, "approve");
    assert.equal(outcome.gate.payoutAttempted, false);
    assert.ok(outcome.gate.confidence != null && outcome.gate.confidence < PAYOUT_CONFIDENCE_FLOOR);
  });

  it("holds an approve when the dispute Noul is at or above 0.5", async () => {
    const seen: Seen = { calls: 0, url: "", auth: "", body: null };
    let payoutCalls = 0;
    const outcome = await payoutAfterJevGate(
      sampleJob(),
      async () => {
        payoutCalls += 1;
        return { batchId: "NO", status: "PENDING" };
      },
      { env: { JEV_API_KEY: "test-key" }, fetchImpl: mockFetch("dispute", seen) },
    );
    assert.equal(seen.calls, 1);
    assert.equal(payoutCalls, 0);
    assert.equal(outcome.held, true);
    assert.equal(outcome.gate.decision, "hold");
    assert.equal(outcome.gate.choice, "approve");
    assert.equal(outcome.gate.confidence, 0.91);
    assert.equal(outcome.gate.noul, PAYOUT_DISPUTE_NOUL);
    assert.equal(outcome.payout, null);
  });

  it("holds when a configured key gets a failed response", async () => {
    const seen: Seen = { calls: 0, url: "", auth: "", body: null };
    let payoutCalls = 0;
    const outcome = await payoutAfterJevGate(
      sampleJob(),
      async () => {
        payoutCalls += 1;
        return { batchId: "NO", status: "PENDING" };
      },
      { env: { JEV_API_KEY: "test-key" }, fetchImpl: mockFetch("error", seen) },
    );
    assert.equal(seen.calls, 1);
    assert.equal(payoutCalls, 0);
    assert.equal(outcome.held, true);
    assert.match(outcome.gate.note, /500/);
  });

  it("reads a result envelope and still holds", () => {
    const parsed = parsePayoutChoice(choiceBody("hold", { envelope: true }));
    assert.equal(parsed.choice, "hold");
    assert.equal(parsed.model, "jev-1.13.0");
  });

  it("writes only the payout request, not proof photos", () => {
    const text = writtenPayoutRequest(sampleJob());
    const request = buildPayoutGateRequest(sampleJob(), "jev-latest");
    assert.equal(request.state, text);
    assert.equal(String(request.state).includes("before.jpg"), false);
    const questions = JSON.stringify(request.questions);
    assert.equal(questions.includes("before.jpg"), false);
    assert.equal(questions.includes("/uploads/after.png"), false);
    assert.match(questions, /Do not compute or replace the amount/);
    assert.match(questions, /legal judgment/);
    assert.equal(request.questions.payout_dispute.type, "noul");
  });
});
