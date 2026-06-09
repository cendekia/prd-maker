import { NextRequest, NextResponse } from "next/server";
import { VersionKind } from "@prisma/client";

import { db } from "@/lib/db";
import { env } from "@/env";
import { takeSnapshot } from "@/lib/snapshots";

/**
 * Vercel cron handler. Snapshots every page that has been edited since its
 * last AUTO snapshot. Vercel sends `Authorization: Bearer $CRON_SECRET` —
 * we reject anything else. Local-dev callers can use the same header.
 *
 * Schedule: every 30 minutes (see vercel.json). The 35-minute look-back
 * window over `Page.updatedAt` is intentionally a bit wider than the cadence
 * so a single missed run still gets caught.
 */
// Reads the Authorization header, so it can never be statically rendered.
export const dynamic = "force-dynamic";
// The sweep snapshots every dirty page in a loop; on a busy workspace that can
// outlast the default serverless timeout. (Sub-daily cron schedules require a
// Vercel Pro plan — see vercel.json.)
export const maxDuration = 60;

const LOOKBACK_MS = 35 * 60 * 1000;
const MIN_SINCE_LAST_SNAPSHOT_MS = 30 * 60 * 1000;

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

  const now = Date.now();
  const recentSince = new Date(now - LOOKBACK_MS);

  // Pages touched recently. We pull the latest AUTO snapshot inline so we can
  // skip pages that already have a fresh enough one without a second round-trip.
  const pages = await db.page.findMany({
    where: {
      archivedAt: null,
      updatedAt: { gte: recentSince },
    },
    select: {
      id: true,
      updatedAt: true,
      createdById: true,
      versions: {
        where: { kind: VersionKind.AUTO },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });

  const stillDirty = pages.filter((p) => {
    const last = p.versions[0]?.createdAt;
    if (!last) return true;
    return now - last.getTime() >= MIN_SINCE_LAST_SNAPSHOT_MS;
  });

  let created = 0;
  let skipped = 0;
  const errors: { pageId: string; message: string }[] = [];

  for (const page of stillDirty) {
    try {
      // No fresh editor JSON available server-side; takeSnapshot falls back
      // to whatever Page.contentJson holds (last save / collab-Y reader).
      // We attribute the system-authored version to the page creator so
      // the createdById foreign key stays valid; UI labels these as "Auto".
      const result = await takeSnapshot({
        pageId: page.id,
        userId: page.createdById,
        kind: "AUTO",
      });
      if (result.created) created += 1;
      else skipped += 1;
    } catch (e) {
      errors.push({ pageId: page.id, message: (e as Error).message });
    }
  }

  return NextResponse.json({
    scanned: pages.length,
    candidates: stillDirty.length,
    created,
    skipped,
    errors,
  });
}
