import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getPageAccess } from "@/lib/permissions";

interface Params {
  params: Promise<{ pageId: string; versionId: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  const { pageId, versionId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const access = await getPageAccess(pageId, session.user.id);
  if (!access) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  const version = await db.pageVersion.findUnique({
    where: { id: versionId },
    select: {
      id: true,
      pageId: true,
      kind: true,
      createdAt: true,
      snapshotJson: true,
      createdBy: {
        select: { id: true, name: true, email: true, image: true },
      },
    },
  });
  if (!version || version.pageId !== pageId) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: version.id,
    kind: version.kind,
    createdAt: version.createdAt.toISOString(),
    createdBy: version.createdBy,
    snapshotJson: version.snapshotJson,
  });
}
