import { NextRequest, NextResponse } from "next/server";
import { getJob, updateJob } from "@/lib/store";
import { agentCreateCustomerOrder } from "@/lib/paypal-agent";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!job.aiScore?.passed) {
    return NextResponse.json(
      { error: "AI completeness check must pass before payment" },
      { status: 400 }
    );
  }

  const origin = req.nextUrl.origin;
  const result = await agentCreateCustomerOrder(job, {
    returnUrl: `${origin}/jobs/${id}/success`,
    cancelUrl: `${origin}/jobs/${id}?canceled=1`,
  });

  const updated = await updateJob(id, {
    paypalOrderId: result.order.id,
    paymentStatus: "order_created",
  });

  return NextResponse.json({
    job: updated,
    orderId: result.order.id,
    status: result.order.status,
    approveUrl: result.approveUrl,
    agentPath: result.path,
    demo: Boolean(result.order.demo),
  });
}
