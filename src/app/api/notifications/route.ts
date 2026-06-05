import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { db } from "@/lib/db";

/** The current user's recent notifications + unread count. Per-user (not
 * workspace-scoped), so it uses the session directly. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const [rows, unread] = await Promise.all([
    db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, type: true, payload: true, readAt: true, createdAt: true },
    }),
    db.notification.count({ where: { userId, readAt: null } }),
  ]);
  return NextResponse.json({
    notifications: rows.map((n) => ({
      id: n.id,
      type: n.type,
      payload: n.payload,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    })),
    unread,
  });
}

/** Mark one notification (`{ id }`) or all (`{ all: true }`) as read. */
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  let body: { id?: unknown; all?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }

  if (body.all === true) {
    await db.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  } else if (typeof body.id === "string") {
    // Scope by userId so a user can only mark their own notifications.
    await db.notification.updateMany({
      where: { id: body.id, userId },
      data: { readAt: new Date() },
    });
  } else {
    return NextResponse.json(
      { error: "Provide `id` or `all: true`." },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
