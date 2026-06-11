import { NextRequest, NextResponse } from "next/server";

import { env } from "@/env";
import { drainAgentJobs } from "@/lib/agent/jobs";

/**
 * Vercel cron handler (Step 49): drains a small batch of queued agent jobs
 * (workspace scans fan out page extractions; extractions call the managed
 * model). Authenticated exactly like snapshot-dirty — Vercel sends
 * `Authorization: Bearer $CRON_SECRET`. The small batch keeps one run well
 * inside the function window; leftovers ride the next tick.
 *
 * Schedule: every 10 minutes (see vercel.json; sub-daily cron needs Vercel Pro).
 */
export const runtime = "nodejs";
// Reads the Authorization header, so it can never be statically rendered.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_LIMIT = 3;

export async function GET(req: NextRequest) {
  if (!env.CRON_SECRET) {
    return NextResponse.json(
      { error: "Cron not configured (CRON_SECRET missing)" },
      { status: 503 },
    );
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const summary = await drainAgentJobs({
    limit: BATCH_LIMIT,
    deadlineMs: 50_000,
  });
  return NextResponse.json(summary);
}
