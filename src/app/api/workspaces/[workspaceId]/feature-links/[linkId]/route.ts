import { NextResponse } from "next/server";
import { FeatureLinkKind, Role } from "@prisma/client";

import { getApiContext, isResponse, jsonError } from "@/lib/api";
import { deleteLink, updateLink } from "@/lib/agent/features";
import { requireRole } from "@/lib/workspace";

interface Params {
  params: Promise<{ workspaceId: string; linkId: string }>;
}

function parseKind(v: unknown): FeatureLinkKind | undefined {
  return typeof v === "string" &&
    (Object.values(FeatureLinkKind) as string[]).includes(v)
    ? (v as FeatureLinkKind)
    : undefined;
}

export async function PATCH(req: Request, { params }: Params) {
  const { workspaceId, linkId } = await params;
  const ctx = await getApiContext(workspaceId);
  if (isResponse(ctx)) return ctx;
  try {
    requireRole(ctx.member.role, Role.EDITOR);
  } catch (e) {
    return jsonError((e as Error).message, 403);
  }

  let body: { kind?: string; rationale?: string | null } = {};
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body");
  }

  try {
    const link = await updateLink({
      linkId,
      workspaceId: ctx.workspace.id,
      actorRole: ctx.member.role,
      kind: parseKind(body.kind),
      rationale:
        body.rationale === undefined
          ? undefined
          : typeof body.rationale === "string"
            ? body.rationale
            : null,
    });
    return NextResponse.json({ link });
  } catch (e) {
    return jsonError((e as Error).message, 400);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { workspaceId, linkId } = await params;
  const ctx = await getApiContext(workspaceId);
  if (isResponse(ctx)) return ctx;
  try {
    requireRole(ctx.member.role, Role.EDITOR);
  } catch (e) {
    return jsonError((e as Error).message, 403);
  }

  try {
    await deleteLink({
      linkId,
      workspaceId: ctx.workspace.id,
      actorRole: ctx.member.role,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError((e as Error).message, 400);
  }
}
