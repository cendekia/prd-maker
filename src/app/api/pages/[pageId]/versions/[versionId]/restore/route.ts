import { NextResponse } from "next/server";
import { Role, VersionKind } from "@prisma/client";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { extractText } from "@/lib/editor-text";
import { getPageAccess } from "@/lib/permissions";
import { takeSnapshot } from "@/lib/snapshots";

interface Params {
  params: Promise<{ pageId: string; versionId: string }>;
}

/**
 * Restore a page to a prior `PageVersion`.
 *
 * Flow:
 *  1. Snapshot the current state as MANUAL — the user gets an undo if they
 *     change their mind. (We reuse MANUAL rather than introducing a new
 *     RESTORE kind to keep the VersionKind enum tight.)
 *  2. Write the chosen snapshot back into Page.contentJson + contentText so
 *     search and non-collab readers immediately reflect the restored state.
 *  3. Return the snapshot JSON to the caller. The client editor applies it
 *     via setContent, which — when collab is active — flows through
 *     y-prosemirror into the shared Y.Doc and broadcasts to all viewers
 *     through Hocuspocus.
 *
 * We intentionally do NOT mutate `Page.yDocState` here. The connected
 * editor's transaction is the authoritative path; the next time Hocuspocus
 * persists the doc it will overwrite yDocState with the post-restore state.
 */
export async function POST(_req: Request, { params }: Params) {
  const { pageId, versionId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const access = await getPageAccess(pageId, session.user.id);
  if (!access) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }
  if (access.role === Role.VIEWER) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const version = await db.pageVersion.findUnique({
    where: { id: versionId },
    select: { id: true, pageId: true, snapshotJson: true },
  });
  if (!version || version.pageId !== pageId) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  // Safety snapshot of the current state before we overwrite it.
  try {
    await takeSnapshot({
      pageId,
      userId: session.user.id,
      kind: "MANUAL",
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to snapshot current state: ${(e as Error).message}` },
      { status: 500 },
    );
  }

  const snapshotJson = version.snapshotJson;
  await db.page.update({
    where: { id: pageId },
    data: {
      contentJson: snapshotJson ?? undefined,
      contentText: extractText(snapshotJson),
    },
  });

  // Audit-only marker so the history list shows that a restore happened.
  // (Step 28 will replace this with a proper AuditEvent row.)
  await db.pageVersion.create({
    data: {
      pageId,
      kind: VersionKind.MANUAL,
      createdById: session.user.id,
      snapshotJson: snapshotJson ?? {},
    },
  });

  return NextResponse.json({
    ok: true,
    snapshotJson,
  });
}
