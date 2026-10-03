import { NextRequest, NextResponse } from "next/server";
import { getJob, updateJob } from "@/lib/store";
import { agentPayoutToContractor } from "@/lib/paypal-agent";
import { PayoutAfterGateError } from "@/lib/jev/payout-gate";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (
    job.paymentStatus !== "paid" &&
    job.paymentStatus !== "payout_sent" &&
    job.paymentStatus !== "payout_held"
  ) {
    return NextResponse.json(
      { error: "Capture customer payment first" },
      { status: 400 }
    );
  }

  try {
    const result = await agentPayoutToContractor(job);
    if (result.held) {
      const updated = await updateJob(id, {
        paymentStatus: "payout_held",
        jevPayout: result.gate,
      });
      return NextResponse.json({
        job: updated,
        payout: null,
        held: true,
        gate: result.gate,
      });
    }

    const updated = await updateJob(id, {
      paypalPayoutBatchId: result.payout.batchId,
      paymentStatus: "payout_sent",
      jevPayout: result.gate,
    });
    return NextResponse.json({
      job: updated,
      payout: result.payout,
      held: false,
      gate: result.gate,
    });
  } catch (err) {
    if (err instanceof PayoutAfterGateError) {
      const updated = await updateJob(id, { jevPayout: err.gate });
      return NextResponse.json(
        { error: err.message, job: updated, held: false, gate: err.gate },
        { status: 502 }
      );
    }
    const message = err instanceof Error ? err.message : "Payout failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
