import { NextResponse } from "next/server";
import { Prisma, Role } from "@prisma/client";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getPageAccess } from "@/lib/permissions";

interface Params {
  params: Promise<{ pageId: string }>;
}

const Body = z
  .object({
    epicId: z.string().min(1).nullable().optional(),
    agileStatus: z
      .enum(["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"])
      .optional(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).nullable().optional(),
    storyPoints: z.number().int().min(0).max(999).nullable().optional(),
    targetSprint: z.string().max(80).nullable().optional(),
    assigneeId: z.string().min(1).nullable().optional(),
    externalUrl: z.string().max(2000).nullable().optional(),
  })
  .strict();

export async function PATCH(req: Request, { params }: Params) {
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

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const data: Prisma.PageUncheckedUpdateInput = {};

  // Epic + assignee must belong to this page's workspace.
  if (body.epicId !== undefined) {
    if (body.epicId === null) {
      data.epicId = null;
    } else {
      const epic = await db.epic.findUnique({
        where: { id: body.epicId },
        select: { workspaceId: true, archivedAt: true },
      });
      if (!epic || epic.workspaceId !== access.workspaceId || epic.archivedAt) {
        return NextResponse.json({ error: "Epic not found" }, { status: 400 });
      }
      data.epicId = body.epicId;
    }
  }
  if (body.assigneeId !== undefined) {
    if (body.assigneeId === null) {
      data.assigneeId = null;
    } else {
      const member = await db.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: access.workspaceId,
            userId: body.assigneeId,
          },
        },
        select: { id: true },
      });
      if (!member) {
        return NextResponse.json(
          { error: "Assignee is not a workspace member" },
          { status: 400 },
        );
      }
      data.assigneeId = body.assigneeId;
    }
  }
  if (body.agileStatus !== undefined) data.agileStatus = body.agileStatus;
  if (body.priority !== undefined) data.priority = body.priority;
  if (body.storyPoints !== undefined) data.storyPoints = body.storyPoints;
  if (body.targetSprint !== undefined) {
    const s = body.targetSprint?.trim() ?? null;
    data.targetSprint = s || null;
  }
  if (body.externalUrl !== undefined) {
    const u = body.externalUrl?.trim() ?? null;
    if (u && !/^https?:\/\//i.test(u)) {
      return NextResponse.json(
        { error: "URL must start with http:// or https://" },
        { status: 400 },
      );
    }
    data.externalUrl = u || null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  await db.page.update({ where: { id: pageId }, data });
  return NextResponse.json({ ok: true });
}
