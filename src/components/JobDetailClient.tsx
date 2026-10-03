"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { Job } from "@/lib/types";
import { JevPayoutNotice } from "./JevPayoutNotice";
import { StatusBadge } from "./StatusBadge";

export function JobDetailClient({ initialJob }: { initialJob: Job }) {
  const router = useRouter();
  const [job, setJob] = useState(initialJob);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approveUrl, setApproveUrl] = useState<string | null>(null);
  const [agentPath, setAgentPath] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/jobs/${job.id}`);
    const data = await res.json();
    if (data.job) setJob(data.job);
  }, [job.id]);

  async function attachSample(sample: "kitchen" | "driveway" | "fence") {
    setBusy("sample");
    setError(null);
    try {
      for (const slot of ["before", "after"] as const) {
        const res = await fetch(`/api/jobs/${job.id}/proof`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slot, sample }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Sample attach failed");
        setJob(data.job);
      }
      setMessage(`Attached ${sample} before/after sample proofs.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(null);
    }
  }

  async function uploadFile(slot: "before" | "after", file: File) {
    setBusy(`upload-${slot}`);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("slot", slot);
      fd.set("file", file);
      const res = await fetch(`/api/jobs/${job.id}/proof`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setJob(data.job);
      setMessage(`Uploaded ${slot} photo.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(null);
    }
  }

  async function runScore() {
    setBusy("score");
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${job.id}/score`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Score failed");
      setJob(data.job);
      setMessage(
        data.aiScore.passed
          ? `AI PASS — score ${data.aiScore.score}/100 (${data.aiScore.method})`
          : `AI FAIL — score ${data.aiScore.score}/100`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(null);
    }
  }

  async function createPayPalOrder() {
    setBusy("order");
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${job.id}/pay/create-order`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Create order failed");
      setJob(data.job);
      setApproveUrl(data.approveUrl || null);
      setAgentPath(data.agentPath);
      setMessage(
        data.demo
          ? `Demo order created (${data.orderId}). Add PAYPAL_CLIENT_ID/SECRET for live sandbox money movement.`
          : `PayPal order ${data.orderId} created via ${data.agentPath}.`
      );
      if (data.approveUrl && !data.demo) {
        // open approve in same tab for sandbox demo
        window.location.href = data.approveUrl;
      } else if (data.demo && data.approveUrl) {
        // stay and allow capture simulation
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(null);
    }
  }

  async function retryPayout() {
    setBusy("payout");
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${job.id}/payout`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Payout failed");
      if (data.job) setJob(data.job);
      if (data.held || data.job?.paymentStatus === "payout_held") {
        setMessage("Jev held this payout. PayPal was not asked to create it.");
        return;
      }
      setMessage(
        data.payout?.batchId
          ? `Payout continued through PayPal (${data.payout.batchId}).`
          : "Payout continued through PayPal."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(null);
    }
  }

  async function captureAndPayout() {
    setBusy("capture");
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${job.id}/pay/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alsoPayout: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Capture failed");
      setJob(data.job);
      if (data.held || data.job?.paymentStatus === "payout_held") {
        setMessage("Jev held this payout. PayPal was not asked to create it.");
        return;
      }
      router.push(`/jobs/${job.id}/success`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{job.title}</h1>
          <p className="mt-1 text-slate-600">{job.description}</p>
          <p className="mt-2 text-sm text-slate-500">
            Contractor: {job.contractorName ? `${job.contractorName} · ` : ""}
            {job.contractorEmail} · ${job.amount.toFixed(2)} {job.currency}
          </p>
        </div>
        <StatusBadge status={job.paymentStatus} />
      </div>

      {(message || error) && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            error ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-900"
          }`}
        >
          {error || message}
        </div>
      )}

      {/* Proof */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">1. Proof photos</h2>
        <p className="mt-1 text-sm text-slate-500">
          Upload before/after images or attach curated samples for a fast judge demo.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {(["kitchen", "driveway", "fence"] as const).map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy !== null}
              onClick={() => attachSample(s)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm capitalize hover:bg-slate-50 disabled:opacity-50"
            >
              Use {s} samples
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {(["before", "after"] as const).map((slot) => {
            const url = slot === "before" ? job.beforeImageUrl : job.afterImageUrl;
            return (
              <div key={slot} className="rounded-xl border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium capitalize">{slot}</span>
                  <label className="cursor-pointer text-sm text-[#0070BA]">
                    Upload
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadFile(slot, f);
                      }}
                    />
                  </label>
                </div>
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={slot} className="h-48 w-full rounded-lg object-cover bg-slate-100" />
                ) : (
                  <div className="flex h-48 items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400">
                    No {slot} photo
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* AI score */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">2. AI completeness check</h2>
        <p className="mt-1 text-sm text-slate-500">
          Deterministic local scorer (works without API keys). Optional OpenAI if{" "}
          <code className="rounded bg-slate-100 px-1">OPENAI_API_KEY</code> is set.
        </p>
        <button
          type="button"
          disabled={busy !== null || !job.beforeImageUrl || !job.afterImageUrl}
          onClick={() => void runScore()}
          className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {busy === "score" ? "Scoring…" : "Run AI score"}
        </button>
        {job.aiScore && (
          <div className="mt-4 rounded-xl bg-slate-50 p-4">
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold tabular-nums">{job.aiScore.score}</span>
              <span className="text-slate-500">/ 100 · threshold {job.aiScore.threshold}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  job.aiScore.passed
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-rose-100 text-rose-800"
                }`}
              >
                {job.aiScore.passed ? "PASS" : "FAIL"} · {job.aiScore.method}
              </span>
            </div>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
              {job.aiScore.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Pay */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">3. Pay with PayPal (sandbox)</h2>
        <p className="mt-1 text-sm text-slate-500">
          On pass, the PayPal agent creates an Orders v2 order (customer pays), then capture.
          Before a payout, an optional Jev text gate can approve or hold. Approve continues
          into the existing sandbox payout. Hold stops it. Jev does not send the money.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={busy !== null || !job.aiScore?.passed}
            onClick={() => void createPayPalOrder()}
            className="rounded-lg bg-[#0070BA] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#005ea6] disabled:opacity-50"
          >
            {busy === "order" ? "Creating order…" : "Create PayPal order"}
          </button>
          <button
            type="button"
            disabled={
              busy !== null ||
              !job.paypalOrderId ||
              ["paid", "payout_sent", "payout_held"].includes(job.paymentStatus)
            }
            onClick={() => void captureAndPayout()}
            className="rounded-lg border border-[#0070BA] px-4 py-2.5 text-sm font-medium text-[#0070BA] hover:bg-sky-50 disabled:opacity-50"
          >
            {busy === "capture" ? "Capturing…" : "Capture + payout contractor"}
          </button>
          {job.paymentStatus === "payout_held" && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void retryPayout()}
              className="rounded-lg border border-amber-700 px-4 py-2.5 text-sm font-medium text-amber-900 hover:bg-amber-50 disabled:opacity-50"
            >
              {busy === "payout" ? "Checking gate…" : "Retry payout"}
            </button>
          )}
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>
        <div className="mt-4">
          <JevPayoutNotice decision={job.jevPayout} />
        </div>
        {(approveUrl || agentPath || job.paypalOrderId) && (
          <dl className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
            {agentPath && (
              <>
                <dt className="font-medium text-slate-800">Agent path</dt>
                <dd className="font-mono text-xs">{agentPath}</dd>
              </>
            )}
            {job.paypalOrderId && (
              <>
                <dt className="font-medium text-slate-800">Order ID</dt>
                <dd className="font-mono text-xs">{job.paypalOrderId}</dd>
              </>
            )}
            {job.paypalCaptureId && (
              <>
                <dt className="font-medium text-slate-800">Capture ID</dt>
                <dd className="font-mono text-xs">{job.paypalCaptureId}</dd>
              </>
            )}
            {job.paypalPayoutBatchId && (
              <>
                <dt className="font-medium text-slate-800">Payout batch</dt>
                <dd className="font-mono text-xs">{job.paypalPayoutBatchId}</dd>
              </>
            )}
            {approveUrl && (
              <>
                <dt className="font-medium text-slate-800">Approve URL</dt>
                <dd className="truncate">
                  <a href={approveUrl} className="text-[#0070BA] underline">
                    {approveUrl}
                  </a>
                </dd>
              </>
            )}
          </dl>
        )}
      </section>
    </div>
  );
}
