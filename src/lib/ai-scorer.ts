import type { AiScoreResult, ImageMeta, Job } from "./types";

const PASS_THRESHOLD = 70;

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

function scoreImagePresence(meta?: ImageMeta, label?: string) {
  const reasons: string[] = [];
  let points = 0;
  if (!meta) {
    reasons.push(`Missing ${label ?? "image"}.`);
    return { points, reasons };
  }
  points += 25;
  reasons.push(`${label ?? "Image"} present (+25).`);

  if (meta.size >= 5_000) {
    points += 10;
    reasons.push(`${label} size looks substantive (${meta.size} bytes, +10).`);
  } else if (meta.size > 0) {
    points += 4;
    reasons.push(`${label} is small (${meta.size} bytes, +4).`);
  }

  if (meta.type.startsWith("image/")) {
    points += 5;
    reasons.push(`${label} MIME is image/* (+5).`);
  }

  if (meta.width && meta.height) {
    const area = meta.width * meta.height;
    if (area >= 200_000) {
      points += 8;
      reasons.push(`${label} resolution ${meta.width}x${meta.height} (+8).`);
    } else if (area >= 40_000) {
      points += 4;
      reasons.push(`${label} resolution adequate (+4).`);
    }
  }

  if (meta.isSample) {
    points += 5;
    reasons.push(`${label} uses curated sample proof (+5).`);
  }

  return { points, reasons };
}

function scoreJobContext(job: Job) {
  const reasons: string[] = [];
  let points = 0;

  if (job.title && job.title.trim().length >= 4) {
    points += 8;
    reasons.push("Job title is descriptive (+8).");
  }

  if (job.amount > 0 && job.amount <= 10_000) {
    points += 7;
    reasons.push("Amount is within sane contractor range (+7).");
  } else if (job.amount > 0) {
    points += 2;
    reasons.push("Amount present but unusually high (+2).");
  }

  if (job.contractorEmail.includes("@") && job.contractorEmail.includes(".")) {
    points += 7;
    reasons.push("Contractor PayPal email format looks valid (+7).");
  }

  if (job.beforeImageUrl && job.afterImageUrl && job.beforeImageUrl !== job.afterImageUrl) {
    points += 10;
    reasons.push("Before and after proofs are distinct (+10).");
  } else if (job.beforeImageUrl && job.afterImageUrl) {
    reasons.push("Before and after appear identical (0).");
  }

  return { points, reasons };
}

/** Deterministic local completeness scorer — works with zero API keys. */
export function scoreLocal(job: Job): AiScoreResult {
  const before = scoreImagePresence(job.beforeImageMeta, "Before photo");
  const after = scoreImagePresence(job.afterImageMeta, "After photo");
  const ctx = scoreJobContext(job);

  const score = clamp(before.points + after.points + ctx.points);
  const reasons = [...before.reasons, ...after.reasons, ...ctx.reasons];
  const passed = score >= PASS_THRESHOLD;

  if (passed) {
    reasons.push(`PASS: score ${score} ≥ threshold ${PASS_THRESHOLD}.`);
  } else {
    reasons.push(`FAIL: score ${score} < threshold ${PASS_THRESHOLD}. Upload clearer before/after proof.`);
  }

  return {
    score,
    passed,
    threshold: PASS_THRESHOLD,
    reasons,
    method: "local",
    details: {
      beforePoints: before.points,
      afterPoints: after.points,
      contextPoints: ctx.points,
      hasBefore: Boolean(job.beforeImageUrl),
      hasAfter: Boolean(job.afterImageUrl),
    },
  };
}

async function scoreWithOpenAI(job: Job, local: AiScoreResult): Promise<AiScoreResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return local;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a job-completion verifier. Return JSON {score:0-100, passed:boolean, reasons:string[]}. Pass if before/after proof plausibly shows completed work.",
          },
          {
            role: "user",
            content: JSON.stringify({
              title: job.title,
              amount: job.amount,
              beforeMeta: job.beforeImageMeta,
              afterMeta: job.afterImageMeta,
              localHint: local,
            }),
          },
        ],
      }),
    });

    if (!res.ok) return local;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return local;
    const parsed = JSON.parse(content) as {
      score?: number;
      passed?: boolean;
      reasons?: string[];
    };
    const score = clamp(Number(parsed.score ?? local.score));
    return {
      score,
      passed: parsed.passed ?? score >= PASS_THRESHOLD,
      threshold: PASS_THRESHOLD,
      reasons: parsed.reasons?.length ? parsed.reasons : local.reasons,
      method: "openai",
      details: { ...local.details, openaiAugmented: true },
    };
  } catch {
    return local;
  }
}

export async function scoreJobCompleteness(job: Job): Promise<AiScoreResult> {
  const local = scoreLocal(job);
  if (process.env.OPENAI_API_KEY) {
    return scoreWithOpenAI(job, local);
  }
  return local;
}
