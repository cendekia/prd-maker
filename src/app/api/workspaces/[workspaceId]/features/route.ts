import { NextResponse } from "next/server";
import { Role } from "@prisma/client";

import { getApiContext, isResponse, jsonError } from "@/lib/api";
import { createFeature, listGraph } from "@/lib/agent/features";
import { requireRole } from "@/lib/workspace";

interface Params {
  params: Promise<{ workspaceId: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  const { workspaceId } = await params;
  const ctx = await getApiContext(workspaceId);
  if (isResponse(ctx)) return ctx;

  const graph = await listGraph(ctx.workspace.id);
  return NextResponse.json({ graph });
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

  let body: { stackId?: string; name?: string; summary?: string } = {};
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body");
  }
  if (
    typeof body.stackId !== "string" ||
    typeof body.name !== "string" ||
    typeof body.summary !== "string"
  ) {
    return jsonError("stackId, name, and summary are required.");
  }

  try {
    const feature = await createFeature({
      workspaceId: ctx.workspace.id,
      actorId: ctx.user.id,
      actorRole: ctx.member.role,
      stackId: body.stackId,
      name: body.name,
      summary: body.summary,
    });
    return NextResponse.json({ feature }, { status: 201 });
  } catch (e) {
    return jsonError((e as Error).message, 400);
  }
}
