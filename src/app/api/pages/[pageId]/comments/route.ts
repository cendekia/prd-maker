import { NextResponse } from "next/server";
import { Role } from "@prisma/client";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { enqueueNotification } from "@/lib/notifications";
import { getPageAccess } from "@/lib/permissions";
import { extractMentions } from "@/lib/comments";

interface Params {
  params: Promise<{ pageId: string }>;
}

interface CommentDto {
  id: string;
  pageId: string;
  parentId: string | null;
  body: string;
  anchor: { from: number; to: number } | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string | null; email: string; image: string | null };
}

export async function GET(_req: Request, { params }: Params) {
  const { pageId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const access = await getPageAccess(pageId, session.user.id);
  if (!access) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  const rows = await db.comment.findMany({
    where: { pageId },
    orderBy: { createdAt: "asc" },
    include: {
      author: { select: { id: true, name: true, email: true, image: true } },
    },
  });

  const comments: CommentDto[] = rows.map((c) => ({
    id: c.id,
    pageId: c.pageId,
    parentId: c.parentId,
    body: c.body,
    anchor: c.anchor as CommentDto["anchor"],
    resolvedAt: c.resolvedAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    author: c.author,
  }));

  return NextResponse.json({ comments });
}

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

  let body: {
    body?: unknown;
    parentId?: unknown;
    anchor?: unknown;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (text.length === 0) {
    return NextResponse.json({ error: "body required" }, { status: 400 });
  }
  if (text.length > 4000) {
    return NextResponse.json({ error: "body too long" }, { status: 400 });
  }

  const parentId = typeof body.parentId === "string" ? body.parentId : null;
  if (parentId) {
    // Replies must target an existing comment on the same page.
    const parent = await db.comment.findUnique({
      where: { id: parentId },
      select: { id: true, pageId: true },
    });
    if (!parent || parent.pageId !== pageId) {
      return NextResponse.json({ error: "Invalid parentId" }, { status: 400 });
    }
  }

  const anchor =
    body.anchor &&
    typeof body.anchor === "object" &&
    "from" in (body.anchor as object) &&
    "to" in (body.anchor as object)
      ? (body.anchor as { from: number; to: number })
      : null;

  const created = await db.comment.create({
    data: {
      pageId,
      parentId: parentId ?? undefined,
      authorId: session.user.id,
      body: text,
      anchor: anchor ?? undefined,
    },
    include: {
      author: { select: { id: true, name: true, email: true, image: true } },
    },
  });

  // Fan out notifications: every @mentioned member + the parent thread author.
  const mentionedIds = extractMentions(text);
  const targetIds = new Set<string>(mentionedIds.filter((id) => id !== session.user.id));

  if (parentId) {
    const parent = await db.comment.findUnique({
      where: { id: parentId },
      select: { authorId: true },
    });
    if (parent && parent.authorId !== session.user.id) {
      targetIds.add(parent.authorId);
    }
  }

  for (const userId of targetIds) {
    await enqueueNotification({
      userId,
      type: mentionedIds.includes(userId) ? "comment.mention" : "comment.reply",
      actorId: session.user.id,
      data: { pageId, commentId: created.id },
    });
  }

  const dto: CommentDto = {
    id: created.id,
    pageId: created.pageId,
    parentId: created.parentId,
    body: created.body,
    anchor: created.anchor as CommentDto["anchor"],
    resolvedAt: created.resolvedAt?.toISOString() ?? null,
    createdAt: created.createdAt.toISOString(),
    updatedAt: created.updatedAt.toISOString(),
    author: created.author,
  };

  return NextResponse.json({ comment: dto }, { status: 201 });
}
