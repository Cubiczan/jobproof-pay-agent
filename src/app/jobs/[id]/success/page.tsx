import Link from "next/link";
import { getJob, updateJob } from "@/lib/store";
import { agentCaptureOrder, agentPayoutToContractor } from "@/lib/paypal-agent";
import { PayoutAfterGateError } from "@/lib/jev/payout-gate";
import { notFound } from "next/navigation";
import { JevPayoutNotice } from "@/components/JevPayoutNotice";
import { StatusBadge } from "@/components/StatusBadge";
import type { JevPayoutDecision, PaymentStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string; PayerID?: string; demo?: string }>;
};

export default async function SuccessPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  let job = await getJob(id);
  if (!job) notFound();

  // Returning from PayPal approve redirect — capture automatically
  const orderId = sp.token || job.paypalOrderId;
  if (
    orderId &&
    job.paymentStatus !== "paid" &&
    job.paymentStatus !== "payout_sent" &&
    job.paymentStatus !== "payout_held"
  ) {
    try {
      const capture = await agentCaptureOrder(orderId);
      let payoutBatchId = job.paypalPayoutBatchId;
      let paymentStatus: PaymentStatus =
        capture.status === "COMPLETED" ? "paid" : "paid";
      let jevPayout: JevPayoutDecision | undefined = job.jevPayout;
      try {
        const result = await agentPayoutToContractor({
          ...job,
          paypalOrderId: orderId,
        });
        jevPayout = result.gate;
        if (result.held) {
          paymentStatus = "payout_held";
        } else {
          payoutBatchId = result.payout.batchId;
          paymentStatus = "payout_sent";
        }
      } catch (err) {
        if (err instanceof PayoutAfterGateError) jevPayout = err.gate;
        // capture succeeded; payout optional
      }
      job =
        (await updateJob(id, {
          paypalOrderId: orderId,
          paypalCaptureId: capture.captureId,
          paypalPayoutBatchId: payoutBatchId,
          paymentStatus,
          ...(jevPayout ? { jevPayout } : {}),
        })) || job;
    } catch (err) {
      console.error("Auto-capture on success page failed", err);
    }
  }

  const held = job.paymentStatus === "payout_held";

  return (
    <div className="mx-auto max-w-lg space-y-6 text-center">
      <div
        className={`rounded-3xl border p-8 ${
          held ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"
        }`}
      >
        <p
          className={`text-sm font-medium uppercase tracking-wide ${
            held ? "text-amber-800" : "text-emerald-700"
          }`}
        >
          {held ? "Customer payment captured" : "Payment flow complete"}
        </p>
        <h1 className={`mt-2 text-3xl font-bold ${held ? "text-amber-950" : "text-emerald-950"}`}>
          {held ? "Payout held" : "Success"}
        </h1>
        <p className={`mt-3 ${held ? "text-amber-950/80" : "text-emerald-900/80"}`}>
          Job <strong>{job.title}</strong> —{" "}
          <StatusBadge status={job.paymentStatus} />
        </p>
        <dl className={`mt-6 space-y-2 text-left text-sm ${held ? "text-amber-950/80" : "text-emerald-950/80"}`}>
          <div className="flex justify-between gap-4">
            <dt>Amount</dt>
            <dd className="font-mono">
              ${job.amount.toFixed(2)} {job.currency}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Order</dt>
            <dd className="font-mono text-xs">{job.paypalOrderId || "—"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Capture</dt>
            <dd className="font-mono text-xs">{job.paypalCaptureId || "—"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Payout batch</dt>
            <dd className="font-mono text-xs">{job.paypalPayoutBatchId || "—"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Contractor</dt>
            <dd>{job.contractorEmail}</dd>
          </div>
          {job.aiScore && (
            <div className="flex justify-between gap-4">
              <dt>AI score</dt>
              <dd>
                {job.aiScore.score}/100 ({job.aiScore.method})
              </dd>
            </div>
          )}
        </dl>
        <div className="mt-6">
          <JevPayoutNotice decision={job.jevPayout} />
        </div>
      </div>
      <div className="flex justify-center gap-3">
        <Link href={`/jobs/${job.id}`} className="text-[#0070BA] underline">
          Back to job
        </Link>
        <Link href="/jobs" className="text-[#0070BA] underline">
          All jobs
        </Link>
      </div>
    </div>
  );
}
