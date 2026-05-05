import { NextResponse } from "next/server";

import { getApiContext, isResponse, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import {
  archivePage,
  deletePage,
  renamePage,
  restorePage,
} from "@/lib/pages";

interface Params {
  params: Promise<{ workspaceId: string; pageId: string }>;
}

export async function PATCH(req: Request, { params }: Params) {
  const { workspaceId, pageId } = await params;
  const ctx = await getApiContext(workspaceId);
  if (isResponse(ctx)) return ctx;

  // Confirm the page is in this workspace.
  const page = await db.page.findUnique({
    where: { id: pageId },
    select: { workspaceId: true },
  });
  if (!page || page.workspaceId !== ctx.workspace.id) {
    return jsonError("Page not found", 404);
  }

  let body: { title?: string; archived?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body");
  }

  try {
    if (typeof body.title === "string") {
      const renamed = await renamePage({
        pageId,
        actorId: ctx.user.id,
        actorRole: ctx.member.role,
        title: body.title,
      });
      return NextResponse.json({ page: renamed });
    }
    if (body.archived === true) {
      await archivePage({
        pageId,
        actorId: ctx.user.id,
        actorRole: ctx.member.role,
      });
      return NextResponse.json({ ok: true });
    }
    if (body.archived === false) {
      await restorePage({
        pageId,
        actorId: ctx.user.id,
        actorRole: ctx.member.role,
      });
      return NextResponse.json({ ok: true });
    }
    return jsonError("Nothing to update.");
  } catch (e) {
    return jsonError((e as Error).message, 400);
  }
}

export async function DELETE(req: Request, { params }: Params) {
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

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  try {
    await deletePage({
      pageId,
      actorId: ctx.user.id,
      actorRole: ctx.member.role,
      force,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError((e as Error).message, 400);
  }
}
