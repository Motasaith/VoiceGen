import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import { deleteJob, getJob } from "@/lib/db";
import { OUTPUT_DIR } from "@/lib/paths";
import { publicJob } from "@/lib/jobView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  return NextResponse.json(publicJob(job, true));
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const job = deleteJob(id);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  for (const ext of [job.output_format ?? "mp3", "srt", "vtt"]) {
    await fs.unlink(path.join(OUTPUT_DIR, `${id}.${ext}`)).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
