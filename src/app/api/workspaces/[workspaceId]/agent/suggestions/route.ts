import { NextResponse } from "next/server";
import { FeatureLinkKind, PageFeatureRole, Role } from "@prisma/client";

import { getApiContext, isResponse, jsonError } from "@/lib/api";
import {
  bulkAcceptSuggestions,
  getSuggestionCounts,
  getSuggestionQueue,
  mergeSuggestedFeature,
  resolveSuggestedFeature,
  resolveSuggestedLink,
  resolveSuggestedPageLink,
} from "@/lib/agent/features";
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

function parseRole(v: unknown): PageFeatureRole | undefined {
  return typeof v === "string" &&
    (Object.values(PageFeatureRole) as string[]).includes(v)
    ? (v as PageFeatureRole)
    : undefined;
}

export async function GET(_req: Request, { params }: Params) {
  const { workspaceId } = await params;
  const ctx = await getApiContext(workspaceId);
  if (isResponse(ctx)) return ctx;

  const [queue, counts] = await Promise.all([
    getSuggestionQueue(ctx.workspace.id),
    getSuggestionCounts(ctx.workspace.id),
  ]);
  return NextResponse.json({ queue, counts });
}

/**
 * Resolve suggestions (Step 50). Body:
 * `{ target: "feature"|"link"|"pageLink", action: "accept"|"reject"|"merge"|"bulkAccept", id?, edits?, targetFeatureId? }`
 */
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
    target?: string;
    action?: string;
    id?: string;
    targetFeatureId?: string;
    edits?: {
      name?: string;
      summary?: string;
      stackId?: string;
      kind?: string;
      role?: string;
    };
  } = {};
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body");
  }
  const { target, action, id } = body;
  if (
    target !== "feature" &&
    target !== "link" &&
    target !== "pageLink"
  ) {
    return jsonError("target must be feature, link, or pageLink.");
  }

  const base = { workspaceId: ctx.workspace.id, actorRole: ctx.member.role };
  try {
    if (action === "bulkAccept") {
      const group =
        target === "feature"
          ? ("features" as const)
          : target === "link"
            ? ("links" as const)
            : ("pageLinks" as const);
      const result = await bulkAcceptSuggestions({ ...base, group });
      const counts = await getSuggestionCounts(ctx.workspace.id);
      return NextResponse.json({ ok: true, result, counts });
    }

    if (typeof id !== "string" || !id) {
      return jsonError("id is required.");
    }

    if (action === "merge") {
      if (target !== "feature") {
        return jsonError("Only features can be merged.");
      }
      if (typeof body.targetFeatureId !== "string" || !body.targetFeatureId) {
        return jsonError("targetFeatureId is required.");
      }
      await mergeSuggestedFeature({
        ...base,
        featureId: id,
        targetFeatureId: body.targetFeatureId,
      });
    } else if (action === "accept" || action === "reject") {
      if (target === "feature") {
        await resolveSuggestedFeature({
          ...base,
          featureId: id,
          action,
          edits:
            action === "accept"
              ? {
                  name: body.edits?.name,
                  summary: body.edits?.summary,
                  stackId: body.edits?.stackId,
                }
              : undefined,
        });
      } else if (target === "link") {
        await resolveSuggestedLink({
          ...base,
          linkId: id,
          action,
          kind: action === "accept" ? parseKind(body.edits?.kind) : undefined,
        });
      } else {
        await resolveSuggestedPageLink({
          ...base,
          pageFeatureId: id,
          action,
          role: action === "accept" ? parseRole(body.edits?.role) : undefined,
        });
      }
    } else {
      return jsonError("action must be accept, reject, merge, or bulkAccept.");
    }

    const counts = await getSuggestionCounts(ctx.workspace.id);
    return NextResponse.json({ ok: true, counts });
  } catch (e) {
    return jsonError((e as Error).message, 400);
  }
}
