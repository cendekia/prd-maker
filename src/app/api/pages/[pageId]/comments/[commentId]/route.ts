import { NextResponse } from "next/server";
import { Role } from "@prisma/client";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getPageAccess } from "@/lib/permissions";

interface Params {
  params: Promise<{ pageId: string; commentId: string }>;
}

export async function PATCH(req: Request, { params }: Params) {
  const { pageId, commentId } = await params;
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

  let body: { resolved?: unknown; text?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const existing = await db.comment.findUnique({
    where: { id: commentId },
    select: { id: true, pageId: true, authorId: true },
  });
  if (!existing || existing.pageId !== pageId) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  const data: { resolvedAt?: Date | null; body?: string } = {};

  if (typeof body.resolved === "boolean") {
    data.resolvedAt = body.resolved ? new Date() : null;
  }
  if (typeof body.text === "string") {
    // Only the author may edit their own text.
    if (existing.authorId !== session.user.id) {
      return NextResponse.json({ error: "Only the author can edit" }, { status: 403 });
    }
    const trimmed = body.text.trim();
    if (trimmed.length === 0 || trimmed.length > 4000) {
      return NextResponse.json({ error: "body invalid" }, { status: 400 });
    }
    data.body = trimmed;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "no-op" }, { status: 400 });
  }

  const updated = await db.comment.update({
    where: { id: commentId },
    data,
    select: { id: true, resolvedAt: true, body: true, updatedAt: true },
  });

  return NextResponse.json({
    id: updated.id,
    body: updated.body,
    resolvedAt: updated.resolvedAt?.toISOString() ?? null,
    updatedAt: updated.updatedAt.toISOString(),
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { pageId, commentId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const access = await getPageAccess(pageId, session.user.id);
  if (!access) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  const existing = await db.comment.findUnique({
    where: { id: commentId },
    select: { id: true, pageId: true, authorId: true },
  });
  if (!existing || existing.pageId !== pageId) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  // Author can delete their own comment; OWNER can delete any.
  const isAuthor = existing.authorId === session.user.id;
  const isOwner = access.role === Role.OWNER;
  if (!isAuthor && !isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.comment.delete({ where: { id: commentId } });
  return NextResponse.json({ ok: true });
}
