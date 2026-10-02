import { NextRequest, NextResponse } from "next/server";
import { describeAgentCapabilities } from "@/lib/paypal-agent";
import { listJobs } from "@/lib/store";
import { getPayPalMode } from "@/lib/paypal";

/**
 * Lightweight agent status / explain endpoint (no LLM required).
 * Shows how the PayPal agent toolkit is wired for judges.
 */
export async function GET() {
  const jobs = await listJobs();
  return NextResponse.json({
    agent: describeAgentCapabilities(),
    paypalMode: getPayPalMode(),
    jobsReadyToPay: jobs.filter((j) => j.paymentStatus === "ready_to_pay").length,
    jobsPaid: jobs.filter((j) =>
      ["paid", "payout_sent"].includes(j.paymentStatus)
    ).length,
    workflow: [
      "1. Create job with contractor PayPal email + amount",
      "2. Attach before/after proof photos",
      "3. Local AI completeness scorer (optional OpenAI)",
      "4. On pass → PayPal agent create_order (Orders v2)",
      "5. Customer approves in sandbox → capture (pay_order)",
      "6. Optional Payouts API → contractor email",
    ],
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { message?: string };
  const message = (body.message || "").toLowerCase();
  const caps = describeAgentCapabilities();

  let reply =
    "I'm the JobProof Pay Agent. I verify job proof with local AI, then move money via PayPal Orders v2 + Payouts in sandbox.";

  if (message.includes("tool") || message.includes("paypal")) {
    reply = `PayPal mode: ${caps.mode}. Enabled tools: ${caps.tools.join(", ")}. Toolkit loaded: ${caps.toolkitLoaded}.`;
  } else if (message.includes("how") || message.includes("flow")) {
    reply =
      "Flow: create job → upload before/after → run AI score → on pass create PayPal order → capture → payout contractor.";
  }

  return NextResponse.json({ reply, agent: caps });
}
