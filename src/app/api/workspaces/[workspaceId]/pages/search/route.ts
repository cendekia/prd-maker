import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getApiContext, isResponse } from "@/lib/api";

interface Params {
  params: Promise<{ workspaceId: string }>;
}

/**
 * Title-only page search for the Cmd-K palette and the [[Page name]] picker.
 * Step 22 adds the full-text variant (over `Page.contentText`) at
 * /api/workspaces/[id]/search and integrates that into the palette as a
 * second tab.
 */
export async function GET(req: Request, { params }: Params) {
  const { workspaceId } = await params;
  const ctx = await getApiContext(workspaceId);
  if (isResponse(ctx)) return ctx;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") ?? 10), 1),
    25,
  );

  const where: Parameters<typeof db.page.findMany>[0] = {
    where: {
      workspaceId: ctx.workspace.id,
      archivedAt: null,
      ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: q
      ? { updatedAt: "desc" }
      : [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      title: true,
      parentId: true,
      isPublished: true,
      updatedAt: true,
    },
  };

  const pages = await db.page.findMany(where);

  return NextResponse.json({
    results: pages.map((p) => ({
      id: p.id,
      title: p.title || "Untitled",
      parentId: p.parentId,
      isPublished: p.isPublished,
      updatedAt: p.updatedAt.toISOString(),
    })),
  });
}
