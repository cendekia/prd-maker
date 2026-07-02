import { NextResponse } from "next/server";

import { getApiContext, isResponse, jsonError } from "@/lib/api";
import { createPage, getPageTree } from "@/lib/pages";

interface Params {
  params: Promise<{ workspaceId: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  const { workspaceId } = await params;
  const ctx = await getApiContext(workspaceId);
  if (isResponse(ctx)) return ctx;

  const tree = await getPageTree(ctx.workspace.id);
  return NextResponse.json({ tree });
}

export async function POST(req: Request, { params }: Params) {
  const { workspaceId } = await params;
  const ctx = await getApiContext(workspaceId);
  if (isResponse(ctx)) return ctx;

  let body: { parentId?: string | null; title?: string; templateId?: string | null } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }

  try {
    const { page, templateMissing } = await createPage({
      workspaceId: ctx.workspace.id,
      actorId: ctx.user.id,
      actorRole: ctx.member.role,
      parentId: body.parentId ?? null,
      title: body.title,
      templateId: body.templateId ?? null,
    });
    return NextResponse.json({ page, templateMissing }, { status: 201 });
  } catch (e) {
    return jsonError((e as Error).message, 400);
  }
}
