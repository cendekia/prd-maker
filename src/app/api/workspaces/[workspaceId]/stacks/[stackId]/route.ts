import { NextResponse } from "next/server";
import { Role, StackType } from "@prisma/client";

import { getApiContext, isResponse, jsonError } from "@/lib/api";
import { deleteStack, moveStack, updateStack } from "@/lib/agent/stacks";
import { requireRole } from "@/lib/workspace";

interface Params {
  params: Promise<{ workspaceId: string; stackId: string }>;
}

function parseType(v: unknown): StackType | undefined {
  return typeof v === "string" &&
    (Object.values(StackType) as string[]).includes(v)
    ? (v as StackType)
    : undefined;
}

function parseColor(v: unknown): string | undefined {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : undefined;
}

export async function PATCH(req: Request, { params }: Params) {
  const { workspaceId, stackId } = await params;
  const ctx = await getApiContext(workspaceId);
  if (isResponse(ctx)) return ctx;
  try {
    requireRole(ctx.member.role, Role.EDITOR);
  } catch (e) {
    return jsonError((e as Error).message, 403);
  }

  let body: {
    name?: string;
    type?: string;
    description?: string | null;
    color?: string;
    beforeId?: string | null;
    afterId?: string | null;
  } = {};
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body");
  }

  try {
    // Drag-to-reorder: the settings list sends neighbor ids.
    if (body.beforeId !== undefined || body.afterId !== undefined) {
      const stack = await moveStack({
        stackId,
        workspaceId: ctx.workspace.id,
        actorRole: ctx.member.role,
        beforeId: body.beforeId ?? null,
        afterId: body.afterId ?? null,
      });
      return NextResponse.json({ stack });
    }

    const stack = await updateStack({
      stackId,
      workspaceId: ctx.workspace.id,
      actorRole: ctx.member.role,
      name: typeof body.name === "string" ? body.name : undefined,
      type: parseType(body.type),
      description: body.description,
      color: parseColor(body.color),
    });
    return NextResponse.json({ stack });
  } catch (e) {
    return jsonError((e as Error).message, 400);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { workspaceId, stackId } = await params;
  const ctx = await getApiContext(workspaceId);
  if (isResponse(ctx)) return ctx;
  try {
    requireRole(ctx.member.role, Role.OWNER);
  } catch (e) {
    return jsonError((e as Error).message, 403);
  }

  try {
    await deleteStack({
      stackId,
      workspaceId: ctx.workspace.id,
      actorRole: ctx.member.role,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError((e as Error).message, 400);
  }
}
