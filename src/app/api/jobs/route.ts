import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { listJobs, saveJob } from "@/lib/store";
import type { CreateJobInput, Job } from "@/lib/types";

export async function GET() {
  const jobs = await listJobs();
  return NextResponse.json({ jobs });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as CreateJobInput;
  const title = (body.title || "").trim();
  const contractorEmail = (body.contractorEmail || "").trim().toLowerCase();
  const amount = Number(body.amount);

  if (!title || title.length < 3) {
    return NextResponse.json({ error: "Title required (min 3 chars)" }, { status: 400 });
  }
  if (!contractorEmail.includes("@")) {
    return NextResponse.json({ error: "Valid contractor PayPal email required" }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Amount must be a positive number" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const job: Job = {
    id: randomUUID(),
    title,
    description: body.description?.trim() || undefined,
    contractorEmail,
    contractorName: body.contractorName?.trim() || undefined,
    amount: Math.round(amount * 100) / 100,
    currency: (body.currency || "USD").toUpperCase(),
    paymentStatus: "awaiting_ai",
    createdAt: now,
    updatedAt: now,
  };

  await saveJob(job);
  return NextResponse.json({ job }, { status: 201 });
}
