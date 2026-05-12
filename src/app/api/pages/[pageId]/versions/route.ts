import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getPageAccess } from "@/lib/permissions";

interface Params {
  params: Promise<{ pageId: string }>;
}

export interface VersionListItem {
  id: string;
  kind: "AUTO" | "MANUAL" | "PRE_AI";
  createdAt: string;
  createdBy: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(req: Request, { params }: Params) {
  const { pageId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const access = await getPageAccess(pageId, session.user.id);
  if (!access) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const parsed = Number(url.searchParams.get("limit"));
  const limit =
    Number.isFinite(parsed) && parsed > 0
      ? Math.min(parsed, MAX_LIMIT)
      : DEFAULT_LIMIT;

  const rows = await db.pageVersion.findMany({
    where: { pageId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      kind: true,
      createdAt: true,
      createdBy: {
        select: { id: true, name: true, email: true, image: true },
      },
    },
  });

  const versions: VersionListItem[] = rows.map((v) => ({
    id: v.id,
    kind: v.kind,
    createdAt: v.createdAt.toISOString(),
    createdBy: v.createdBy,
  }));

  return NextResponse.json({ versions });
}
