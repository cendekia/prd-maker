import { NextResponse } from "next/server";
import { Role } from "@prisma/client";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getPageAccess } from "@/lib/permissions";

interface Params {
  params: Promise<{ pageId: string }>;
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

  let body: { title?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.title !== "string") {
    return NextResponse.json({ error: "title must be a string" }, { status: 400 });
  }
  const title = body.title.trim().slice(0, 200) || "Untitled";

  const updated = await db.page.update({
    where: { id: pageId },
    data: { title },
    select: { id: true, title: true, updatedAt: true },
  });
  return NextResponse.json({
    id: updated.id,
    title: updated.title,
    updatedAt: updated.updatedAt.toISOString(),
  });
}
