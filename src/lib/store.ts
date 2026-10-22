import { promises as fs } from "fs";
import path from "path";
import type { Job } from "./types";

// Vercel functions have a read-only filesystem except /tmp; keep the demo store there.
const DATA_DIR = process.env.VERCEL ? "/tmp/jobproof-data" : path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "jobs.json");

async function ensureStore(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify({ jobs: [] }, null, 2), "utf8");
  }
}

export async function listJobs(): Promise<Job[]> {
  await ensureStore();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  const parsed = JSON.parse(raw) as { jobs: Job[] };
  return parsed.jobs.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function getJob(id: string): Promise<Job | undefined> {
  const jobs = await listJobs();
  return jobs.find((j) => j.id === id);
}

// Serialize read-modify-write so concurrent requests (e.g. before + after proof
// uploads) can't interleave and corrupt or clobber jobs.json.
let queue: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

export function saveJob(job: Job): Promise<Job> {
  return locked(() => saveJobUnlocked(job));
}

async function saveJobUnlocked(job: Job): Promise<Job> {
  await ensureStore();
  const jobs = await listJobs();
  const idx = jobs.findIndex((j) => j.id === job.id);
  if (idx >= 0) {
    jobs[idx] = job;
  } else {
    jobs.unshift(job);
  }
  const tmp = `${DATA_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify({ jobs }, null, 2), "utf8");
  await fs.rename(tmp, DATA_FILE);
  return job;
}

export function updateJob(
  id: string,
  patch: Partial<Job>
): Promise<Job | undefined> {
  return locked(async () => {
    const job = await getJob(id);
    if (!job) return undefined;
    const next: Job = {
      ...job,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    return saveJobUnlocked(next);
  });
}
