import type { JevPayoutDecision } from "@/lib/types";

const DISCLAIMER =
  "Text-only Choice gate. Jev does not see photos, does not send the payout, and is not the legal or financial judgment.";

export function JevPayoutNotice({ decision }: { decision?: JevPayoutDecision | null }) {
  if (!decision) return null;

  const tone =
    decision.decision === "hold"
      ? "border-amber-200 bg-amber-50 text-amber-950"
      : decision.decision === "approve"
        ? "border-sky-200 bg-sky-50 text-sky-950"
        : "border-slate-200 bg-slate-50 text-slate-800";

  const title =
    decision.decision === "hold"
      ? "Hold — payout stopped"
      : decision.decision === "approve"
        ? "Approve — PayPal payout path continued"
        : "Jev not called — existing payout path";

  const confidence =
    decision.confidence == null ? null : `${Math.round(decision.confidence * 100)}% confidence`;

  return (
    <div className={`rounded-xl border px-4 py-3 text-left text-sm ${tone}`}>
      <p className="font-medium">Jev payout gate · {title}</p>
      <p className="mt-1">{decision.note}</p>
      <p className="mt-2 text-xs opacity-80">
        {[decision.choice ? `Choice ${decision.choice}` : null, decision.model, confidence]
          .filter(Boolean)
          .join(" · ") || "No model call"}
        {decision.payoutAttempted ? " · PayPal payout function was called" : " · PayPal payout function was not called"}
      </p>
      <p className="mt-2 text-xs opacity-80">{DISCLAIMER}</p>
    </div>
  );
}
