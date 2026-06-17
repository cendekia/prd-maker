import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import {
  AgentOrigin,
  ImpactRunStatus,
  PageFeatureRole,
  Role,
  SuggestionStatus,
  type Prisma,
} from "@prisma/client";

import { resolveAiClient } from "@/lib/ai";
import { assertWithinQuota, recordUsage } from "@/lib/ai-usage";
import { buildWorkspaceContext } from "@/lib/agent/context";
import { subgraph } from "@/lib/agent/features";
import {
  buildImpactPrompt,
  buildJsonRetryMessage,
  impactReportSchema,
  ModelJsonError,
  parseModelJson,
} from "@/lib/agent/prompts";
import {
  FEATURE_LINK_KIND_LABELS,
  PAGE_FEATURE_ROLE_LABELS,
  type ImpactAnalysisItem,
  type ImpactFeatureMeta,
  type ImpactReport,
} from "@/lib/agent/types";
import { ROLE_RANK } from "@/lib/config";
import { db } from "@/lib/db";

/**
 * Impact analysis (ai_development_plan.md Step 52) — the headline capability.
 *
 * One run: deterministically assemble candidates (the PRD's connected
 * features, their ≤2-hop graph neighborhood, the budgeted catalog, the page
 * text), make one structured model call through the requesting user's
 * resolved client (BYO works here; managed is quota-checked and metered),
 * and persist the sanitized ImpactReport. A RUNNING row is written first so
 * failures persist as FAILED with the error. Impact runs never write page
 * content — AI document writes stay on the Step 21 snapshot-then-apply path.
 */

const PAGE_TEXT_CAP = 24_000;
const MAX_OUTPUT_TOKENS = 3_000;
const NEIGHBORHOOD_DEPTH = 2;
const HISTORY_LIMIT = 10;

function requireRoleOnWorkspace(actorRole: Role, min: Role) {
  if (ROLE_RANK[actorRole] < ROLE_RANK[min]) {
    throw new Error(`Requires ${min}; have ${actorRole}.`);
  }
}

function toItem(row: {
  id: string;
  status: ImpactRunStatus;
  model: string | null;
  error: string | null;
  createdAt: Date;
  report: Prisma.JsonValue | null;
}): ImpactAnalysisItem {
  const parsed = row.report
    ? impactReportSchema.safeParse(row.report)
    : null;
  return {
    id: row.id,
    status: row.status,
    model: row.model,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    report: parsed?.success ? parsed.data : null,
  };
}

/** Collect every feature id a report mentions, for the meta lookup. */
function reportFeatureIds(report: ImpactReport | null): string[] {
  if (!report) return [];
  const ids = new Set<string>();
  for (const f of report.impactedFeatures) ids.add(f.featureId);
  for (const l of report.suggestedLinks) {
    if (l.from.featureId) ids.add(l.from.featureId);
    if (l.to.featureId) ids.add(l.to.featureId);
  }
  return [...ids];
}

async function buildFeatureMeta(
  workspaceId: string,
  featureIds: string[],
): Promise<Record<string, ImpactFeatureMeta>> {
  if (featureIds.length === 0) return {};
  const features = await db.feature.findMany({
    where: { workspaceId, id: { in: featureIds } },
    select: {
      id: true,
      name: true,
      stack: { select: { name: true, color: true } },
    },
  });
  return Object.fromEntries(
    features.map((f) => [
      f.id,
      { name: f.name, stackName: f.stack.name, stackColor: f.stack.color },
    ]),
  );
}

/** A page's impact-run history (newest first) + meta for rendering reports. */
export async function listImpactAnalyses(
  pageId: string,
  workspaceId: string,
): Promise<{
  analyses: ImpactAnalysisItem[];
  featureMeta: Record<string, ImpactFeatureMeta>;
}> {
  const rows = await db.impactAnalysis.findMany({
    where: { pageId, workspaceId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
    select: {
      id: true,
      status: true,
      model: true,
      error: true,
      createdAt: true,
      report: true,
    },
  });
  const analyses = rows.map(toItem);
  const ids = [...new Set(analyses.flatMap((a) => reportFeatureIds(a.report)))];
  return { analyses, featureMeta: await buildFeatureMeta(workspaceId, ids) };
}

export async function runImpactAnalysis(opts: {
  workspaceId: string;
  pageId: string;
  userId: string;
  actorRole: Role;
}): Promise<{
  analysis: ImpactAnalysisItem;
  featureMeta: Record<string, ImpactFeatureMeta>;
}> {
  requireRoleOnWorkspace(opts.actorRole, Role.EDITOR);

  const page = await db.page.findUnique({
    where: { id: opts.pageId },
    select: {
      workspaceId: true,
      archivedAt: true,
      title: true,
      contentText: true,
    },
  });
  if (!page || page.workspaceId !== opts.workspaceId || page.archivedAt) {
    throw new Error("Page not found.");
  }
  const text = page.contentText.trim();
  if (text.length < 40) {
    throw new Error("Add some content to the PRD before analyzing impact.");
  }

  // Resolve the client first: BYO bypasses the managed quota check entirely.
  const { client, model, byo } = await resolveAiClient({
    workspaceId: opts.workspaceId,
    userId: opts.userId,
  });
  if (!byo) await assertWithinQuota(opts.workspaceId);

  // Deterministic candidate assembly: connected features + ≤2-hop neighborhood.
  const joins = await db.pageFeature.findMany({
    where: {
      pageId: opts.pageId,
      status: { not: SuggestionStatus.REJECTED },
      feature: { archivedAt: null },
    },
    select: { role: true, featureId: true },
  });
  const linkedIds = [...new Set(joins.map((j) => j.featureId))];
  const hood = await subgraph(opts.workspaceId, linkedIds, NEIGHBORHOOD_DEPTH);
  const candidateIds = [...new Set([...linkedIds, ...hood.featureIds])];
  const candidates = await db.feature.findMany({
    where: { id: { in: candidateIds }, workspaceId: opts.workspaceId },
    select: { id: true, name: true, summary: true, stack: { select: { name: true } } },
  });
  const byId = new Map(candidates.map((c) => [c.id, c]));

  const candidateLines: string[] = [];
  if (joins.length > 0) {
    candidateLines.push("This PRD is connected to:");
    for (const j of joins) {
      const f = byId.get(j.featureId);
      if (!f) continue;
      candidateLines.push(
        `- ${PAGE_FEATURE_ROLE_LABELS[j.role].toUpperCase()}: "${f.name}" (id ${f.id}, ${f.stack.name})`,
      );
    }
  }
  if (hood.links.length > 0) {
    candidateLines.push("", `Their neighborhood (≤${NEIGHBORHOOD_DEPTH} hops):`);
    for (const l of hood.links) {
      const from = byId.get(l.fromFeatureId);
      const to = byId.get(l.toFeatureId);
      if (!from || !to) continue;
      candidateLines.push(
        `- "${from.name}" —${FEATURE_LINK_KIND_LABELS[l.kind]}→ "${to.name}"${l.status === "SUGGESTED" ? " (unconfirmed)" : ""}`,
      );
    }
  }

  const catalog = await buildWorkspaceContext(opts.workspaceId);
  const { system, user } = buildImpactPrompt({
    pageTitle: page.title || "Untitled",
    pageText:
      text.length > PAGE_TEXT_CAP
        ? `${text.slice(0, PAGE_TEXT_CAP)}\n…[document truncated]`
        : text,
    catalog,
    candidateBlock: candidateLines.join("\n"),
  });

  // The RUNNING row goes in before the model call so a crash/timeout leaves
  // an honest FAILED trace instead of silence.
  const row = await db.impactAnalysis.create({
    data: {
      workspaceId: opts.workspaceId,
      pageId: opts.pageId,
      status: ImpactRunStatus.RUNNING,
      model,
      createdById: opts.userId,
    },
    select: { id: true, createdAt: true },
  });

  const call = async (messages: Anthropic.MessageParam[]): Promise<string> => {
    const res = await client.messages.create({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0,
      system,
      messages,
    });
    if (!byo) {
      await recordUsage(opts.workspaceId, {
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
      });
    }
    return res.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
  };

  try {
    const first = await call([{ role: "user", content: user }]);
    let report: ImpactReport;
    try {
      report = parseModelJson(impactReportSchema, first);
    } catch (e) {
      if (!(e instanceof ModelJsonError)) throw e;
      const second = await call([
        { role: "user", content: user },
        { role: "assistant", content: first },
        { role: "user", content: buildJsonRetryMessage(e) },
      ]);
      report = parseModelJson(impactReportSchema, second);
    }

    // Sanitize against the live graph: impacted features must exist here;
    // suggested-link endpoints keep their name but drop hallucinated ids.
    const valid = new Set(
      (
        await db.feature.findMany({
          where: { workspaceId: opts.workspaceId, archivedAt: null },
          select: { id: true },
        })
      ).map((f) => f.id),
    );
    const sanitized: ImpactReport = {
      ...report,
      impactedFeatures: report.impactedFeatures.filter((f) =>
        valid.has(f.featureId),
      ),
      suggestedLinks: report.suggestedLinks.map((l) => ({
        ...l,
        from: {
          ...l.from,
          featureId:
            l.from.featureId && valid.has(l.from.featureId)
              ? l.from.featureId
              : null,
        },
        to: {
          ...l.to,
          featureId:
            l.to.featureId && valid.has(l.to.featureId)
              ? l.to.featureId
              : null,
        },
      })),
    };

    const updated = await db.impactAnalysis.update({
      where: { id: row.id },
      data: {
        status: ImpactRunStatus.READY,
        report: sanitized as unknown as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        status: true,
        model: true,
        error: true,
        createdAt: true,
        report: true,
      },
    });
    const analysis = toItem(updated);
    return {
      analysis,
      featureMeta: await buildFeatureMeta(
        opts.workspaceId,
        reportFeatureIds(analysis.report),
      ),
    };
  } catch (e) {
    const message = (e as Error).message;
    await db.impactAnalysis
      .update({
        where: { id: row.id },
        data: { status: ImpactRunStatus.FAILED, error: message },
      })
      .catch(() => {});
    throw e;
  }
}

/**
 * "Apply suggestions": queue the report's proposed links — plus REFERENCES
 * joins from this PRD to each impacted feature — as SUGGESTED rows for the
 * Step 50 review queue. Existing rows (any status) are never touched.
 */
export async function applyImpactSuggestions(opts: {
  workspaceId: string;
  pageId: string;
  actorRole: Role;
  analysisId: string;
}): Promise<{ linksProposed: number; joinsProposed: number; skipped: number }> {
  requireRoleOnWorkspace(opts.actorRole, Role.EDITOR);
  const row = await db.impactAnalysis.findUnique({
    where: { id: opts.analysisId },
    select: { workspaceId: true, pageId: true, report: true, status: true },
  });
  if (
    !row ||
    row.workspaceId !== opts.workspaceId ||
    row.pageId !== opts.pageId ||
    row.status !== ImpactRunStatus.READY ||
    !row.report
  ) {
    throw new Error("No ready report to apply.");
  }
  const parsed = impactReportSchema.safeParse(row.report);
  if (!parsed.success) throw new Error("Stored report is unreadable.");
  const report = parsed.data;

  const valid = new Set(
    (
      await db.feature.findMany({
        where: { workspaceId: opts.workspaceId, archivedAt: null },
        select: { id: true },
      })
    ).map((f) => f.id),
  );

  let linksProposed = 0;
  let joinsProposed = 0;
  let skipped = 0;

  for (const l of report.suggestedLinks) {
    const fromId = l.from.featureId;
    const toId = l.to.featureId;
    if (
      !fromId ||
      !toId ||
      fromId === toId ||
      !valid.has(fromId) ||
      !valid.has(toId)
    ) {
      skipped++; // links involving not-yet-created features need extraction
      continue;
    }
    const existing = await db.featureLink.findUnique({
      where: {
        fromFeatureId_toFeatureId_kind: {
          fromFeatureId: fromId,
          toFeatureId: toId,
          kind: l.kind,
        },
      },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await db.featureLink.create({
      data: {
        workspaceId: opts.workspaceId,
        fromFeatureId: fromId,
        toFeatureId: toId,
        kind: l.kind,
        status: SuggestionStatus.SUGGESTED,
        origin: AgentOrigin.AGENT,
        rationale: l.rationale.trim() || null,
      },
    });
    linksProposed++;
  }

  for (const f of report.impactedFeatures) {
    if (!valid.has(f.featureId)) {
      skipped++;
      continue;
    }
    // Any-role check: if the pair is already connected somehow, don't pile on.
    const existing = await db.pageFeature.findFirst({
      where: { pageId: opts.pageId, featureId: f.featureId },
      select: { id: true },
    });
    if (existing) continue;
    await db.pageFeature.create({
      data: {
        pageId: opts.pageId,
        featureId: f.featureId,
        role: PageFeatureRole.REFERENCES,
        status: SuggestionStatus.SUGGESTED,
        origin: AgentOrigin.AGENT,
      },
    });
    joinsProposed++;
  }

  return { linksProposed, joinsProposed, skipped };
}
