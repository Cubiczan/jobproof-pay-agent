import { promises as fs } from "fs";
import path from "path";
import type { Job } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
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

export async function saveJob(job: Job): Promise<Job> {
  await ensureStore();
  const jobs = await listJobs();
  const idx = jobs.findIndex((j) => j.id === job.id);
  if (idx >= 0) {
    jobs[idx] = job;
  } else {
    jobs.unshift(job);
  }
  await fs.writeFile(DATA_FILE, JSON.stringify({ jobs }, null, 2), "utf8");
  return job;
}

export async function updateJob(
  id: string,
  patch: Partial<Job>
): Promise<Job | undefined> {
  const job = await getJob(id);
  if (!job) return undefined;
  const next: Job = {
    ...job,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  return saveJob(next);
}
