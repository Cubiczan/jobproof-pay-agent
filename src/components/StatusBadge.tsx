import type { PaymentStatus } from "@/lib/types";

const styles: Record<PaymentStatus, string> = {
  unpaid: "bg-slate-100 text-slate-700",
  awaiting_ai: "bg-amber-50 text-amber-800",
  ai_failed: "bg-rose-50 text-rose-800",
  ready_to_pay: "bg-emerald-50 text-emerald-800",
  order_created: "bg-sky-50 text-sky-800",
  paid: "bg-indigo-50 text-indigo-800",
  payout_sent: "bg-green-100 text-green-900",
  error: "bg-red-100 text-red-800",
};

export function StatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
