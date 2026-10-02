"use client";

import Link from "next/link";
import type { Job } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";

export function JobsTable({ jobs }: { jobs: Job[] }) {
  if (!jobs.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
        No jobs yet.{" "}
        <Link href="/jobs/new" className="text-[#0070BA] underline">
          Create one
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-4 py-3 font-medium">Title</th>
            <th className="px-4 py-3 font-medium">Contractor</th>
            <th className="px-4 py-3 font-medium">Amount</th>
            <th className="px-4 py-3 font-medium">AI score</th>
            <th className="px-4 py-3 font-medium">Payment</th>
            <th className="px-4 py-3 font-medium">PayPal order</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} className="border-t border-slate-100 hover:bg-slate-50/80">
              <td className="px-4 py-3">
                <Link href={`/jobs/${job.id}`} className="font-medium text-[#0070BA]">
                  {job.title}
                </Link>
              </td>
              <td className="px-4 py-3 text-slate-600">{job.contractorEmail}</td>
              <td className="px-4 py-3">
                ${job.amount.toFixed(2)} {job.currency}
              </td>
              <td className="px-4 py-3">
                {job.aiScore ? (
                  <span
                    className={
                      job.aiScore.passed ? "text-emerald-700" : "text-rose-700"
                    }
                  >
                    {job.aiScore.score}/100
                  </span>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={job.paymentStatus} />
              </td>
              <td className="px-4 py-3 font-mono text-xs text-slate-500">
                {job.paypalOrderId || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
