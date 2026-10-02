import { NextResponse } from "next/server";
import { describeAgentCapabilities } from "@/lib/paypal-agent";
import { getPayPalMode } from "@/lib/paypal";

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: "JobProof Pay Agent",
    paypalMode: getPayPalMode(),
    agent: describeAgentCapabilities(),
  });
}
