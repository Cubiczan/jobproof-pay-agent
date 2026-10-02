import { NextRequest, NextResponse } from "next/server";
import { getJob, updateJob } from "@/lib/store";
import { agentPayoutToContractor } from "@/lib/paypal-agent";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (job.paymentStatus !== "paid" && job.paymentStatus !== "payout_sent") {
    return NextResponse.json(
      { error: "Capture customer payment first" },
      { status: 400 }
    );
  }

  const payout = await agentPayoutToContractor(job);
  const updated = await updateJob(id, {
    paypalPayoutBatchId: payout.batchId,
    paymentStatus: "payout_sent",
  });

  return NextResponse.json({ job: updated, payout });
}
