import { NextRequest, NextResponse } from "next/server";
import { getJob, updateJob } from "@/lib/store";
import { scoreJobCompleteness } from "@/lib/ai-scorer";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!job.beforeImageUrl || !job.afterImageUrl) {
    return NextResponse.json(
      { error: "Upload before and after proof photos first" },
      { status: 400 }
    );
  }

  const aiScore = await scoreJobCompleteness(job);
  const paymentStatus = aiScore.passed ? "ready_to_pay" : "ai_failed";
  const updated = await updateJob(id, { aiScore, paymentStatus });
  return NextResponse.json({ job: updated, aiScore });
}
