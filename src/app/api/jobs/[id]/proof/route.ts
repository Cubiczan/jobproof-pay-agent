import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { getJob, updateJob } from "@/lib/store";
import type { ImageMeta } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const contentType = req.headers.get("content-type") || "";

  // Sample image attach (JSON)
  if (contentType.includes("application/json")) {
    const body = (await req.json()) as {
      slot: "before" | "after";
      sample: "kitchen" | "driveway" | "fence";
    };
    const sampleMap = {
      kitchen: {
        before: "/samples/kitchen-before.svg",
        after: "/samples/kitchen-after.svg",
      },
      driveway: {
        before: "/samples/driveway-before.svg",
        after: "/samples/driveway-after.svg",
      },
      fence: {
        before: "/samples/fence-before.svg",
        after: "/samples/fence-after.svg",
      },
    };
    const urls = sampleMap[body.sample];
    if (!urls || (body.slot !== "before" && body.slot !== "after")) {
      return NextResponse.json({ error: "Invalid sample/slot" }, { status: 400 });
    }
    const url = body.slot === "before" ? urls.before : urls.after;
    const meta: ImageMeta = {
      name: `${body.sample}-${body.slot}.svg`,
      size: 12_000,
      type: "image/svg+xml",
      width: 800,
      height: 600,
      isSample: true,
      uploadedAt: new Date().toISOString(),
    };
    const patch =
      body.slot === "before"
        ? { beforeImageUrl: url, beforeImageMeta: meta }
        : { afterImageUrl: url, afterImageMeta: meta };
    const updated = await updateJob(id, {
      ...patch,
      paymentStatus: "awaiting_ai",
      aiScore: undefined,
    });
    return NextResponse.json({ job: updated });
  }

  // Multipart upload
  const form = await req.formData();
  const slot = String(form.get("slot") || "");
  const file = form.get("file");
  if ((slot !== "before" && slot !== "after") || !(file instanceof File)) {
    return NextResponse.json({ error: "slot + file required" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image uploads allowed" }, { status: 400 });
  }
  if (file.size > 8 * 1024 * 1024) {
    return NextResponse.json({ error: "Max 8MB" }, { status: 400 });
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const ext = file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "") || "jpg";
  const filename = `${id}-${slot}-${Date.now()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(UPLOAD_DIR, filename), buf);
  const url = `/uploads/${filename}`;

  const meta: ImageMeta = {
    name: file.name,
    size: file.size,
    type: file.type,
    isSample: false,
    uploadedAt: new Date().toISOString(),
  };

  const patch =
    slot === "before"
      ? { beforeImageUrl: url, beforeImageMeta: meta }
      : { afterImageUrl: url, afterImageMeta: meta };

  const updated = await updateJob(id, {
    ...patch,
    paymentStatus: "awaiting_ai",
    aiScore: undefined,
  });
  return NextResponse.json({ job: updated });
}
