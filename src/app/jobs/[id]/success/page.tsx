import Link from "next/link";
import { getJob, updateJob } from "@/lib/store";
import { agentCaptureOrder, agentPayoutToContractor } from "@/lib/paypal-agent";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";

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
    job.paymentStatus !== "payout_sent"
  ) {
    try {
      const capture = await agentCaptureOrder(orderId);
      let payoutBatchId = job.paypalPayoutBatchId;
      let paymentStatus: "paid" | "payout_sent" =
        capture.status === "COMPLETED" ? "paid" : "paid";
      try {
        const payout = await agentPayoutToContractor({
          ...job,
          paypalOrderId: orderId,
        });
        payoutBatchId = payout.batchId;
        paymentStatus = "payout_sent";
      } catch {
        // capture succeeded; payout optional
      }
      job =
        (await updateJob(id, {
          paypalOrderId: orderId,
          paypalCaptureId: capture.captureId,
          paypalPayoutBatchId: payoutBatchId,
          paymentStatus,
        })) || job;
    } catch (err) {
      console.error("Auto-capture on success page failed", err);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 text-center">
      <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-8">
        <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">
          Payment flow complete
        </p>
        <h1 className="mt-2 text-3xl font-bold text-emerald-950">Success</h1>
        <p className="mt-3 text-emerald-900/80">
          Job <strong>{job.title}</strong> —{" "}
          <StatusBadge status={job.paymentStatus} />
        </p>
        <dl className="mt-6 space-y-2 text-left text-sm text-emerald-950/80">
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
