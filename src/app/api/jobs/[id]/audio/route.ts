import fs from "node:fs/promises";
import { NextResponse } from "next/server";

import { getJob } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME: Record<string, string> = { mp3: "audio/mpeg", wav: "audio/wav" };

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  if (!job.output_file) {
    const pending = job.status === "queued" || job.status === "running";
    return NextResponse.json(
      { error: pending ? "Still generating. Poll the job until it is done." : "No audio for this job." },
      { status: pending ? 409 : 404 },
    );
  }

  let data: Buffer;
  try {
    data = await fs.readFile(job.output_file);
  } catch {
    return NextResponse.json({ error: "The audio file has been removed from disk." }, { status: 410 });
  }

  const format = job.output_format ?? "mp3";
  const download = new URL(request.url).searchParams.has("download");
  const safe = (job.title ?? "voicegen").replace(/[^a-z0-9 _-]/gi, "").trim().slice(0, 60) || "voicegen";

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": MIME[format] ?? "application/octet-stream",
      "Content-Length": String(data.length),
      "Content-Disposition": download
        ? `attachment; filename="${safe}.${format}"`
        : `inline; filename="${safe}.${format}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
