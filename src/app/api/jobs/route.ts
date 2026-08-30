import { NextResponse } from "next/server";

import { jobStats, listJobs } from "@/lib/db";
import { publicJob } from "@/lib/jobView";
import { runnerStatus } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") ?? 40)));
  const offset = Math.max(0, Number(searchParams.get("offset") ?? 0));

  return NextResponse.json({
    jobs: listJobs(limit, offset).map((j) => publicJob(j)),
    runner: runnerStatus(),
    stats: jobStats(),
  });
}
