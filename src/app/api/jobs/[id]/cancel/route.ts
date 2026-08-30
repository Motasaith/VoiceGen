import { NextResponse } from "next/server";

import { getJob } from "@/lib/db";
import { cancel } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getJob(id)) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  return NextResponse.json({ cancelled: cancel(id) });
}
