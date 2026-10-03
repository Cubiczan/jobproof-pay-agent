import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Job } from "../types";
import {
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

function choiceBody(choice: string, envelope = false) {
  const body = {
    model: "jev-1.13.0",
    answers: {
      payout_gate: {
        type: "choice",
        choice,
        probabilities: { approve: choice === "approve" ? 0.91 : 0.09, hold: choice === "hold" ? 0.91 : 0.09 },
        confidence: 0.84,
      },
    },
    usage: { input_tokens: 42, output_tokens: 8 },
  };
  return envelope ? { result: body } : body;
}

type Seen = { calls: number; url: string; auth: string; body: unknown };

function mockFetch(mode: "approve" | "hold" | "error" | "envelope-hold", seen: Seen): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    seen.calls += 1;
    seen.url = String(url);
    seen.auth = new Headers(init?.headers).get("Authorization") ?? "";
    seen.body = JSON.parse(String(init?.body));
    if (mode === "error") return new Response("nope", { status: 500 });
    const choice = mode === "approve" ? "approve" : "hold";
    return new Response(JSON.stringify(choiceBody(choice, mode === "envelope-hold")), {
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
      questions: { payout_gate: { type: string; criteria: Record<string, string> } };
    };
    assert.equal(body.model, "jev-latest");
    assert.equal(body.questions.payout_gate.type, "choice");
    assert.deepEqual(Object.keys(body.questions.payout_gate.criteria).sort(), ["approve", "hold"]);
    assert.match(body.state, /Who: Ada Lovelace ada@example.com/);
    assert.match(body.state, /Amount: 125\.00 USD/);
    assert.match(body.state, /Reason: Kitchen backsplash — Replaced tile and grout/);
    assert.equal(body.state.includes("before.jpg"), false);
    assert.equal(body.state.includes("/uploads/after.png"), false);
    assert.equal(JSON.stringify(body).includes("test-key"), false);
  });

  it("continues into the payout function on approve without using the choice as a batch id", async () => {
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
          return mockFetch("approve", seen)(url, init);
        }) as typeof fetch,
      },
    );

    assert.deepEqual(events, ["jev", "paypal:ada@example.com:125"]);
    assert.equal(outcome.held, false);
    if (outcome.held) return;
    assert.equal(outcome.gate.decision, "approve");
    assert.equal(outcome.gate.payoutAttempted, true);
    assert.equal(outcome.payout.batchId, "FROM-PAYPAL");
    assert.equal(seen.url, "https://api.typesafe.ai/v1/systemone");
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
    const parsed = parsePayoutChoice(choiceBody("hold", true));
    assert.equal(parsed.choice, "hold");
    assert.equal(parsed.model, "jev-1.13.0");
  });

  it("writes only the payout request, not proof photos", () => {
    const text = writtenPayoutRequest(sampleJob());
    const request = buildPayoutGateRequest(sampleJob(), "jev-latest");
    assert.equal(request.state, text);
    assert.equal(String(request.state).includes("before.jpg"), false);
  });
});
