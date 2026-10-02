import { NextRequest, NextResponse } from "next/server";
import { getJob, updateJob } from "@/lib/store";
import { agentCaptureOrder, agentPayoutToContractor } from "@/lib/paypal-agent";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    orderId?: string;
    alsoPayout?: boolean;
  };
  const orderId = body.orderId || job.paypalOrderId;
  if (!orderId) {
    return NextResponse.json({ error: "No PayPal order id" }, { status: 400 });
  }

  const capture = await agentCaptureOrder(orderId);
  let payout = null;

  let paymentStatus: "paid" | "payout_sent" | "error" =
    capture.status === "COMPLETED" ? "paid" : "error";

  if (paymentStatus === "paid" && body.alsoPayout !== false) {
    try {
      payout = await agentPayoutToContractor(job);
      paymentStatus = "payout_sent";
    } catch (err) {
      console.warn("Payout failed (order still captured):", err);
    }
  }

  const updated = await updateJob(id, {
    paypalOrderId: orderId,
    paypalCaptureId: capture.captureId,
    paypalPayoutBatchId: payout?.batchId,
    paymentStatus,
  });

  return NextResponse.json({
    job: updated,
    capture,
    payout,
  });
}
