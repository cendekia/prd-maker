import { NextResponse } from "next/server";
import { Role, StackType } from "@prisma/client";

import { getApiContext, isResponse, jsonError } from "@/lib/api";
import { createStack, listStacks } from "@/lib/agent/stacks";
import { requireRole } from "@/lib/workspace";

interface Params {
  params: Promise<{ workspaceId: string }>;
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

export async function GET(_req: Request, { params }: Params) {
  const { workspaceId } = await params;
  const ctx = await getApiContext(workspaceId);
  if (isResponse(ctx)) return ctx;

  const stacks = await listStacks(ctx.workspace.id);
  return NextResponse.json({ stacks });
}

export async function POST(req: Request, { params }: Params) {
  const { workspaceId } = await params;
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
  } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }
  if (typeof body.name !== "string") {
    return jsonError("name is required.");
  }

  try {
    const stack = await createStack({
      workspaceId: ctx.workspace.id,
      actorRole: ctx.member.role,
      name: body.name,
      type: parseType(body.type),
      description: body.description ?? null,
      color: parseColor(body.color),
    });
    return NextResponse.json({ stack }, { status: 201 });
  } catch (e) {
    return jsonError((e as Error).message, 400);
  }
}
