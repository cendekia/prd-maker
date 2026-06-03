import { NextResponse } from "next/server";
import { EpicStatus, Role } from "@prisma/client";

import { getApiContext, isResponse, jsonError } from "@/lib/api";
import { requireRole } from "@/lib/workspace";
import { createEpic, listEpicsWithRollups } from "@/lib/epics";

interface Params {
  params: Promise<{ workspaceId: string }>;
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
  const { workspaceId } = await params;
  const ctx = await getApiContext(workspaceId);
  if (isResponse(ctx)) return ctx;

  const epics = await listEpicsWithRollups(ctx.workspace.id);
  return NextResponse.json({ epics });
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
    description?: string | null;
    color?: string;
    status?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }

  try {
    const epic = await createEpic({
      workspaceId: ctx.workspace.id,
      actorId: ctx.user.id,
      actorRole: ctx.member.role,
      name: body.name,
      description: body.description ?? null,
      color: parseColor(body.color),
      status: parseStatus(body.status),
    });
    // A freshly created epic has no assigned PRDs yet.
    return NextResponse.json(
      { epic: { ...epic, pageCount: 0, doneCount: 0 } },
      { status: 201 },
    );
  } catch (e) {
    return jsonError((e as Error).message, 400);
  }
}
