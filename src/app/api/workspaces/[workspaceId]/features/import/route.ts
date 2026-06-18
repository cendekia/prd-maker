import { NextResponse } from "next/server";
import { Role } from "@prisma/client";

import { getApiContext, isResponse, jsonError } from "@/lib/api";
import { importFeatureGraph } from "@/lib/agent/import";
import { listGraph } from "@/lib/agent/features";
import { assertWorkspaceAgent, PlanGateError } from "@/lib/plan-gate";
import { requireRole } from "@/lib/workspace";

interface Params {
  params: Promise<{ workspaceId: string }>;
}

/**
 * Bulk feature-catalog import/export (Step 56). Restricted to OWNER + Dev Lead
 * — imports write canonical rows that bypass the review queue.
 */

/** GET — export the workspace graph as the importable JSON shape. */
export async function GET(_req: Request, { params }: Params) {
  const { workspaceId } = await params;
  const ctx = await getApiContext(workspaceId);
  if (isResponse(ctx)) return ctx;
  try {
    requireRole(ctx.member.role, Role.DEV_LEAD);
  } catch (e) {
    return jsonError((e as Error).message, 403);
  }

  const graph = await listGraph(ctx.workspace.id);
  const featureById = new Map(graph.features.map((f) => [f.id, f]));

  const payload = {
    stacks: graph.stacks.map((s) => ({
      name: s.name,
      type: s.type,
      ...(s.description ? { description: s.description } : {}),
      features: graph.features
        .filter((f) => f.stackId === s.id && f.status !== "DEPRECATED")
        .map((f) => ({ name: f.name, summary: f.summary })),
    })),
    links: graph.links
      .filter((l) => l.status === "CONFIRMED")
      .map((l) => {
        const from = featureById.get(l.fromFeatureId);
        const to = featureById.get(l.toFeatureId);
        return from && to
          ? {
              from: from.name,
              fromStack: graph.stacks.find((s) => s.id === from.stackId)?.name,
              to: to.name,
              toStack: graph.stacks.find((s) => s.id === to.stackId)?.name,
              kind: l.kind,
              ...(l.rationale ? { rationale: l.rationale } : {}),
            }
          : null;
      })
      .filter(Boolean),
  };

  return NextResponse.json(payload, {
    headers: {
      "Content-Disposition": `attachment; filename="${ctx.workspace.slug}-features.json"`,
    },
  });
}

export async function POST(req: Request, { params }: Params) {
  const { workspaceId } = await params;
  const ctx = await getApiContext(workspaceId);
  if (isResponse(ctx)) return ctx;
  try {
    requireRole(ctx.member.role, Role.DEV_LEAD);
  } catch (e) {
    return jsonError((e as Error).message, 403);
  }
  try {
    await assertWorkspaceAgent(ctx.workspace.id);
  } catch (e) {
    if (e instanceof PlanGateError) return jsonError(e.message, 403);
    throw e;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Body must be valid JSON.");
  }

  try {
    const result = await importFeatureGraph({
      workspaceId: ctx.workspace.id,
      actorRole: ctx.member.role,
      payload: body,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: "invalid_payload", issues: result.issues },
        { status: 400 },
      );
    }
    return NextResponse.json({ summary: result.summary });
  } catch (e) {
    return jsonError((e as Error).message, 400);
  }
}
