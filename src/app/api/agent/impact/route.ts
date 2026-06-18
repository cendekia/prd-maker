import { NextResponse } from "next/server";
import { Role } from "@prisma/client";

import { auth } from "@/auth";
import { AiUnavailableError } from "@/lib/ai";
import { AiQuotaExceededError } from "@/lib/ai-usage";
import {
  applyImpactSuggestions,
  listImpactAnalyses,
  runImpactAnalysis,
} from "@/lib/agent/impact";
import { jsonError } from "@/lib/api";
import { assertWorkspaceAgent, PlanGateError } from "@/lib/plan-gate";
import { requirePageAccess } from "@/lib/permissions";

/**
 * Impact analysis runs (Step 52). One structured model call per run, inside
 * the request — the same raised window as the other AI routes.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function pageAccess(pageId: string, minimum: Role) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: jsonError("Unauthorized", 401) } as const;
  }
  try {
    const access = await requirePageAccess(pageId, session.user.id, minimum);
    return { access, userId: session.user.id } as const;
  } catch {
    return { error: jsonError("Page not found", 404) } as const;
  }
}

/** GET ?pageId= — run history + feature meta for rendering reports. */
export async function GET(req: Request) {
  const pageId = new URL(req.url).searchParams.get("pageId");
  if (!pageId) return jsonError("pageId is required.");
  const result = await pageAccess(pageId, Role.VIEWER);
  if ("error" in result) return result.error;

  const data = await listImpactAnalyses(pageId, result.access.workspaceId);
  return NextResponse.json(data);
}

/**
 * POST — `{ pageId, action: "run" }` analyzes now (returns the READY/FAILED
 * analysis); `{ pageId, action: "apply", analysisId }` queues the report's
 * proposals as SUGGESTED rows for the review queue.
 */
export async function POST(req: Request) {
  let body: { pageId?: string; action?: string; analysisId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body");
  }
  const pageId = typeof body.pageId === "string" ? body.pageId : "";
  if (!pageId) return jsonError("pageId is required.");

  const result = await pageAccess(pageId, Role.EDITOR);
  if ("error" in result) return result.error;
  const { access, userId } = result;

  try {
    await assertWorkspaceAgent(access.workspaceId);
  } catch (e) {
    if (e instanceof PlanGateError) return jsonError(e.message, 403);
    throw e;
  }

  if (body.action === "apply") {
    if (typeof body.analysisId !== "string" || !body.analysisId) {
      return jsonError("analysisId is required.");
    }
    try {
      const applied = await applyImpactSuggestions({
        workspaceId: access.workspaceId,
        pageId,
        actorRole: access.role,
        analysisId: body.analysisId,
      });
      return NextResponse.json({ ok: true, applied });
    } catch (e) {
      return jsonError((e as Error).message, 400);
    }
  }

  try {
    const data = await runImpactAnalysis({
      workspaceId: access.workspaceId,
      pageId,
      userId,
      actorRole: access.role,
    });
    return NextResponse.json(data);
  } catch (e) {
    if (e instanceof AiQuotaExceededError) {
      return NextResponse.json(
        { error: "quota_exceeded", plan: e.plan, cap: e.cap, used: e.used },
        { status: 402 },
      );
    }
    if (e instanceof AiUnavailableError) {
      return NextResponse.json(
        { error: "ai_unavailable", message: e.message },
        { status: 503 },
      );
    }
    // The run already persisted a FAILED row with this message.
    return jsonError((e as Error).message, 400);
  }
}
