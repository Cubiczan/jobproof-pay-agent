"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function JobForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "Kitchen tile refresh",
    description: "Remove old backsplash, install new subway tile, clean grout.",
    contractorEmail: "contractor@example.com",
    contractorName: "Alex Rivera",
    amount: "125.00",
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          amount: Number(form.amount),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create job");
      router.push(`/jobs/${data.job.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Job title</label>
        <input
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
        <textarea
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
          rows={3}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Contractor PayPal email
          </label>
          <input
            type="email"
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            value={form.contractorEmail}
            onChange={(e) => setForm({ ...form, contractorEmail: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Contractor name</label>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            value={form.contractorName}
            onChange={(e) => setForm({ ...form, contractorName: e.target.value })}
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Amount (USD)</label>
        <input
          type="number"
          step="0.01"
          min="1"
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          required
        />
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-[#0070BA] px-4 py-2.5 font-medium text-white hover:bg-[#005ea6] disabled:opacity-60"
      >
        {loading ? "Creating…" : "Create job & continue to proof"}
      </button>
    </form>
  );
}
