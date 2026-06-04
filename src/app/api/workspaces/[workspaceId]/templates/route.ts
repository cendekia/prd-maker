import { NextResponse } from "next/server";

import { getApiContext, isResponse } from "@/lib/api";
import { db } from "@/lib/db";

interface Params {
  params: Promise<{ workspaceId: string }>;
}

/**
 * Templates available to a workspace: system templates (workspaceId null,
 * seeded by prisma/seed.ts) plus this workspace's own custom templates.
 * Consumed by the "+ New page" template picker.
 */
export async function GET(_req: Request, { params }: Params) {
  const { workspaceId } = await params;
  const ctx = await getApiContext(workspaceId);
  if (isResponse(ctx)) return ctx;

  const rows = await db.template.findMany({
    where: { OR: [{ workspaceId: null }, { workspaceId: ctx.workspace.id }] },
    select: { id: true, name: true, description: true, workspaceId: true },
  });

  const templates = rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    isSystem: r.workspaceId === null,
  }));
  // System templates first, then alphabetical.
  templates.sort((a, b) =>
    a.isSystem === b.isSystem ? a.name.localeCompare(b.name) : a.isSystem ? -1 : 1,
  );

  return NextResponse.json({ templates });
}
