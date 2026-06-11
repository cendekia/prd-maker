import { NextResponse } from "next/server";
import { FeatureStatus, Role } from "@prisma/client";

import { getApiContext, isResponse, jsonError } from "@/lib/api";
import {
  deleteFeature,
  getFeatureDetail,
  updateFeature,
} from "@/lib/agent/features";
import { requireRole } from "@/lib/workspace";

interface Params {
  params: Promise<{ workspaceId: string; featureId: string }>;
}

function parseStatus(v: unknown): FeatureStatus | undefined {
  return typeof v === "string" &&
    (Object.values(FeatureStatus) as string[]).includes(v)
    ? (v as FeatureStatus)
    : undefined;
}

export async function GET(_req: Request, { params }: Params) {
  const { workspaceId, featureId } = await params;
  const ctx = await getApiContext(workspaceId);
  if (isResponse(ctx)) return ctx;

  const detail = await getFeatureDetail(featureId, ctx.workspace.id);
  if (!detail) return jsonError("Feature not found", 404);
  return NextResponse.json(detail);
}

export async function PATCH(req: Request, { params }: Params) {
  const { workspaceId, featureId } = await params;
  const ctx = await getApiContext(workspaceId);
  if (isResponse(ctx)) return ctx;
  try {
    requireRole(ctx.member.role, Role.EDITOR);
  } catch (e) {
    return jsonError((e as Error).message, 403);
  }

  let body: {
    name?: string;
    summary?: string;
    status?: string;
    stackId?: string;
    archived?: boolean;
  } = {};
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body");
  }

  try {
    const feature = await updateFeature({
      featureId,
      workspaceId: ctx.workspace.id,
      actorRole: ctx.member.role,
      name: typeof body.name === "string" ? body.name : undefined,
      summary: typeof body.summary === "string" ? body.summary : undefined,
      status: parseStatus(body.status),
      stackId: typeof body.stackId === "string" ? body.stackId : undefined,
      archived: typeof body.archived === "boolean" ? body.archived : undefined,
    });
    return NextResponse.json({ feature });
  } catch (e) {
    return jsonError((e as Error).message, 400);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { workspaceId, featureId } = await params;
  const ctx = await getApiContext(workspaceId);
  if (isResponse(ctx)) return ctx;
  try {
    requireRole(ctx.member.role, Role.OWNER);
  } catch (e) {
    return jsonError((e as Error).message, 403);
  }

  try {
    await deleteFeature({
      featureId,
      workspaceId: ctx.workspace.id,
      actorRole: ctx.member.role,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError((e as Error).message, 400);
  }
}
