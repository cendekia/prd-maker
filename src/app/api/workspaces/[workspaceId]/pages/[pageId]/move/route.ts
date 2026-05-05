import { NextResponse } from "next/server";

import { getApiContext, isResponse, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { movePage } from "@/lib/pages";

interface Params {
  params: Promise<{ workspaceId: string; pageId: string }>;
}

export async function POST(req: Request, { params }: Params) {
  const { workspaceId, pageId } = await params;
  const ctx = await getApiContext(workspaceId);
  if (isResponse(ctx)) return ctx;

  const page = await db.page.findUnique({
    where: { id: pageId },
    select: { workspaceId: true },
  });
  if (!page || page.workspaceId !== ctx.workspace.id) {
    return jsonError("Page not found", 404);
  }

  let body: {
    newParentId?: string | null;
    beforeId?: string | null;
    afterId?: string | null;
  } = {};
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body");
  }

  try {
    const updated = await movePage({
      pageId,
      actorId: ctx.user.id,
      actorRole: ctx.member.role,
      newParentId: body.newParentId ?? null,
      beforeId: body.beforeId ?? null,
      afterId: body.afterId ?? null,
    });
    return NextResponse.json({ page: updated });
  } catch (e) {
    return jsonError((e as Error).message, 400);
  }
}
