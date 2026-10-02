import { listJobs } from "@/lib/store";
import { JobsTable } from "@/components/JobsTable";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const jobs = await listJobs();
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Jobs</h1>
          <p className="text-sm text-slate-500">
            Lightweight jobs grid (AG Grid–style sponsor angle without a heavy dependency).
          </p>
        </div>
        <Link
          href="/jobs/new"
          className="rounded-lg bg-[#0070BA] px-4 py-2 text-sm font-medium text-white"
        >
          New job
        </Link>
      </div>
      <JobsTable jobs={jobs} />
    </div>
  );
}
