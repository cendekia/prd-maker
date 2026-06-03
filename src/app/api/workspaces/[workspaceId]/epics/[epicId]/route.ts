import { NextResponse } from "next/server";
import { EpicStatus, Role } from "@prisma/client";

import { getApiContext, isResponse, jsonError } from "@/lib/api";
import { requireRole } from "@/lib/workspace";
import {
  deleteEpic,
  getEpicWithPages,
  moveEpic,
  updateEpic,
} from "@/lib/epics";

interface Params {
  params: Promise<{ workspaceId: string; epicId: string }>;
}

function parseStatus(v: unknown): EpicStatus | undefined {
  return typeof v === "string" && (Object.values(EpicStatus) as string[]).includes(v)
    ? (v as EpicStatus)
    : undefined;
}

function parseColor(v: unknown): string | undefined {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : undefined;
}

export async function GET(_req: Request, { params }: Params) {
  const { workspaceId, epicId } = await params;
  const ctx = await getApiContext(workspaceId);
  if (isResponse(ctx)) return ctx;

  const data = await getEpicWithPages(epicId, ctx.workspace.id);
  if (!data) return jsonError("Epic not found", 404);
  return NextResponse.json(data);
}

export async function PATCH(req: Request, { params }: Params) {
  const { workspaceId, epicId } = await params;
  const ctx = await getApiContext(workspaceId);
  if (isResponse(ctx)) return ctx;
  try {
    requireRole(ctx.member.role, Role.EDITOR);
  } catch (e) {
    return jsonError((e as Error).message, 403);
  }

  let body: {
    name?: string;
    description?: string | null;
    color?: string;
    status?: string;
    archived?: boolean;
    beforeId?: string | null;
    afterId?: string | null;
  } = {};
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body");
  }

  try {
    // Drag-and-drop reorder: the board sends a target status + neighbor ids.
    if (body.beforeId !== undefined || body.afterId !== undefined) {
      const status = parseStatus(body.status);
      if (!status) return jsonError("A valid status is required to move an epic.");
      const epic = await moveEpic({
        epicId,
        workspaceId: ctx.workspace.id,
        actorRole: ctx.member.role,
        status,
        beforeId: body.beforeId ?? null,
        afterId: body.afterId ?? null,
      });
      return NextResponse.json({ epic });
    }

    const epic = await updateEpic({
      epicId,
      workspaceId: ctx.workspace.id,
      actorRole: ctx.member.role,
      name: body.name,
      description: body.description,
      color: parseColor(body.color),
      status: parseStatus(body.status),
      archived: typeof body.archived === "boolean" ? body.archived : undefined,
    });
    return NextResponse.json({ epic });
  } catch (e) {
    return jsonError((e as Error).message, 400);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { workspaceId, epicId } = await params;
  const ctx = await getApiContext(workspaceId);
  if (isResponse(ctx)) return ctx;
  try {
    requireRole(ctx.member.role, Role.OWNER);
  } catch (e) {
    return jsonError((e as Error).message, 403);
  }

  try {
    await deleteEpic({
      epicId,
      workspaceId: ctx.workspace.id,
      actorRole: ctx.member.role,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError((e as Error).message, 400);
  }
}
