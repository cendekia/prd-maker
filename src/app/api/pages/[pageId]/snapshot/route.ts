import { NextResponse } from "next/server";
import { Role } from "@prisma/client";

import { auth } from "@/auth";
import { getPageAccess } from "@/lib/permissions";
import {
  takeSnapshot,
  type SnapshotKind,
} from "@/lib/snapshots";

interface Params {
  params: Promise<{ pageId: string }>;
}

const ALLOWED_KINDS: SnapshotKind[] = ["AUTO", "MANUAL", "PRE_AI"];

export async function POST(req: Request, { params }: Params) {
  const { pageId } = await params;
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

  let body: { kind?: unknown; contentJson?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // Body optional — empty defaults to AUTO with no fresh JSON.
  }

  const requestedKind = typeof body.kind === "string" ? body.kind : "AUTO";
  if (!ALLOWED_KINDS.includes(requestedKind as SnapshotKind)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }
  const kind = requestedKind as SnapshotKind;

  const contentJson =
    body.contentJson && typeof body.contentJson === "object"
      ? body.contentJson
      : undefined;

  try {
    const result = await takeSnapshot({
      pageId,
      userId: session.user.id,
      kind,
      contentJson,
    });
    return NextResponse.json({
      versionId: result.version.id,
      created: result.created,
      createdAt: result.version.createdAt.toISOString(),
      kind: result.version.kind,
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 400 },
    );
  }
}
