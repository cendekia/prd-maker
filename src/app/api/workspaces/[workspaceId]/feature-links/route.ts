import { NextResponse } from "next/server";
import { FeatureLinkKind, Role } from "@prisma/client";

import { getApiContext, isResponse, jsonError } from "@/lib/api";
import { createLink } from "@/lib/agent/features";
import { requireRole } from "@/lib/workspace";

interface Params {
  params: Promise<{ workspaceId: string }>;
}

function parseKind(v: unknown): FeatureLinkKind | undefined {
  return typeof v === "string" &&
    (Object.values(FeatureLinkKind) as string[]).includes(v)
    ? (v as FeatureLinkKind)
    : undefined;
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
    fromFeatureId?: string;
    toFeatureId?: string;
    kind?: string;
    rationale?: string | null;
  } = {};
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body");
  }
  const kind = parseKind(body.kind);
  if (
    typeof body.fromFeatureId !== "string" ||
    typeof body.toFeatureId !== "string" ||
    !kind
  ) {
    return jsonError("fromFeatureId, toFeatureId, and a valid kind are required.");
  }

  try {
    const link = await createLink({
      workspaceId: ctx.workspace.id,
      actorRole: ctx.member.role,
      fromFeatureId: body.fromFeatureId,
      toFeatureId: body.toFeatureId,
      kind,
      rationale: typeof body.rationale === "string" ? body.rationale : null,
    });
    return NextResponse.json({ link }, { status: 201 });
  } catch (e) {
    return jsonError((e as Error).message, 400);
  }
}
