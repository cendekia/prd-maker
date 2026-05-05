import { NextResponse } from "next/server";
import { Role } from "@prisma/client";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { extractText } from "@/lib/editor-text";
import { getPageAccess } from "@/lib/permissions";

interface Params {
  params: Promise<{ pageId: string }>;
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
  const page = await db.page.findUnique({
    where: { id: pageId },
    select: { id: true, title: true, contentJson: true, updatedAt: true },
  });
  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }
  return NextResponse.json({
    id: page.id,
    title: page.title,
    contentJson: page.contentJson,
    updatedAt: page.updatedAt.toISOString(),
  });
}

export async function PUT(req: Request, { params }: Params) {
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

  let body: { contentJson?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.contentJson || typeof body.contentJson !== "object") {
    return NextResponse.json({ error: "contentJson is required" }, { status: 400 });
  }

  const contentText = extractText(body.contentJson);

  const updated = await db.page.update({
    where: { id: pageId },
    data: {
      contentJson: body.contentJson as never,
      contentText,
    },
    select: { id: true, updatedAt: true },
  });

  return NextResponse.json({
    id: updated.id,
    updatedAt: updated.updatedAt.toISOString(),
  });
}
