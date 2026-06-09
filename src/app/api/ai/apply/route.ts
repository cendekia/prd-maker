import { NextResponse } from "next/server";
import { Role } from "@prisma/client";

import { auth } from "@/auth";
import { getPageAccess } from "@/lib/permissions";
import { takeSnapshot } from "@/lib/snapshots";

export const runtime = "nodejs";
// Snapshotting serialises the live editor doc + writes a version row; give it
// headroom past the default serverless timeout on large pages.
export const maxDuration = 30;

/**
 * Snapshot gate for AI writes into a page (Step 21).
 *
 * The hard invariant: an AI edit must be preceded by a successful PRE_AI
 * snapshot so the user always has a one-click undo. This endpoint takes that
 * snapshot and returns ok; the client applies the edit to the live editor
 * ONLY when this succeeds. If the snapshot fails, we return an error and the
 * client does not write — there is no path that mutates the doc without a
 * snapshot first.
 *
 * `currentJson` is the live editor state the client sends, so the snapshot
 * captures exactly what the user sees before the AI write lands.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  let body: { pageId?: unknown; currentJson?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }
  const pageId = typeof body.pageId === "string" ? body.pageId : "";
  if (!pageId) {
    return NextResponse.json(
      { error: "bad_request", message: "pageId is required." },
      { status: 400 },
    );
  }

  const access = await getPageAccess(pageId, userId);
  if (!access) {
    return NextResponse.json(
      { error: "forbidden", message: "You don't have access to this page." },
      { status: 403 },
    );
  }
  if (access.role === Role.VIEWER) {
    return NextResponse.json(
      { error: "forbidden", message: "You need edit access to apply AI changes." },
      { status: 403 },
    );
  }

  try {
    await takeSnapshot({
      pageId,
      userId,
      kind: "PRE_AI",
      contentJson: body.currentJson ?? undefined,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "snapshot_failed",
        message: `Couldn't snapshot the page before applying: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
