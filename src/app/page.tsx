import Link from "next/link";

export default function HomePage() {
  return (
    <div className="space-y-12">
      <section className="rounded-3xl bg-gradient-to-br from-[#003087] via-[#0070BA] to-[#00A4E4] p-8 text-white shadow-lg sm:p-12">
        <p className="text-sm font-medium uppercase tracking-wider text-sky-100">
          PayPal AI Hackathon · Agentic commerce
        </p>
        <h1 className="mt-3 max-w-2xl text-4xl font-bold leading-tight sm:text-5xl">
          Proof completes the job. AI unlocks the PayPal pay.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-sky-50">
          JobProof Pay Agent lets a contractor upload before/after photos, runs a local AI
          completeness score, and — only on pass — a PayPal agent creates a sandbox Order for
          the customer and optionally Payouts the contractor.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/jobs/new"
            className="rounded-xl bg-white px-5 py-3 font-semibold text-[#003087] hover:bg-sky-50"
          >
            Start demo job
          </Link>
          <Link
            href="/jobs"
            className="rounded-xl border border-white/40 px-5 py-3 font-semibold text-white hover:bg-white/10"
          >
            Jobs table
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          {
            t: "1. Capture proof",
            d: "Create a job with amount + contractor PayPal email, attach before/after photos (or samples).",
          },
          {
            t: "2. Local AI gate",
            d: "Deterministic scorer inspects image metadata + job context. Optional OpenAI if a key is set. Works for judges with zero keys.",
          },
          {
            t: "3. PayPal agent pays",
            d: "On pass: @paypal/agent-toolkit create_order → sandbox approval → capture → Payouts to contractor.",
          },
        ].map((c) => (
          <div key={c.t} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-900">{c.t}</h2>
            <p className="mt-2 text-sm text-slate-600">{c.d}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Why this matters</h2>
        <p className="mt-2 text-slate-600">
          Home-service and gig platforms still move money on trust or manual review. JobProof
          puts an AI completeness gate in front of PayPal money movement — agentic commerce with
          an audit trail of proof, score, order, capture, and payout.
        </p>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>PayPal Orders v2 (create + capture) via Agent Toolkit patterns</li>
          <li>PayPal Payouts API to contractor email</li>
          <li>Sandbox-first; demo mode when credentials are placeholders</li>
          <li>Deploy-ready for Vercel</li>
        </ul>
      </section>
    </div>
  );
}
