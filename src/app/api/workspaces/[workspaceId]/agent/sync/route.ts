import { NextResponse } from "next/server";
import { Role } from "@prisma/client";

import { getApiContext, isResponse, jsonError } from "@/lib/api";
import {
  drainAgentJobs,
  enqueueWorkspaceScan,
  getAgentSyncStatus,
} from "@/lib/agent/jobs";
import { assertWorkspaceAgent, PlanGateError } from "@/lib/plan-gate";
import { requireRole } from "@/lib/workspace";

/**
 * Manual workspace sync (Step 49). POST enqueues a SCAN_WORKSPACE job and
 * then opportunistically drains the queue for this workspace inside the
 * request window — so on dev (no cron) and small workspaces the sync
 * completes in one call; anything left over rides the agent-sync cron.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Params {
  params: Promise<{ workspaceId: string }>;
}

/** Queue stats for the sync button. */
export async function GET(_req: Request, { params }: Params) {
  const { workspaceId } = await params;
  const ctx = await getApiContext(workspaceId);
  if (isResponse(ctx)) return ctx;

  const status = await getAgentSyncStatus(ctx.workspace.id);
  return NextResponse.json({ status });
}

export async function POST(_req: Request, { params }: Params) {
  const { workspaceId } = await params;
  const ctx = await getApiContext(workspaceId);
  if (isResponse(ctx)) return ctx;
  try {
    requireRole(ctx.member.role, Role.EDITOR);
  } catch (e) {
    return jsonError((e as Error).message, 403);
  }
  try {
    await assertWorkspaceAgent(ctx.workspace.id);
  } catch (e) {
    if (e instanceof PlanGateError) return jsonError(e.message, 403);
    throw e;
  }

  await enqueueWorkspaceScan({
    workspaceId: ctx.workspace.id,
    requestedById: ctx.user.id,
  });
  // Generous in-request drain: the scan job runs first (fan-out), then as
  // many extractions as fit before the deadline.
  const drained = await drainAgentJobs({
    workspaceId: ctx.workspace.id,
    limit: 20,
    deadlineMs: 40_000,
  });
  const status = await getAgentSyncStatus(ctx.workspace.id);
  return NextResponse.json({ drained, status });
}
