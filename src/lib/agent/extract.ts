import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import {
  AgentOrigin,
  FeatureStatus,
  SuggestionStatus,
  type Prisma,
} from "@prisma/client";

import { env } from "@/env";
import { AiUnavailableError } from "@/lib/ai";
import { assertWithinQuota, recordUsage } from "@/lib/ai-usage";
import { buildWorkspaceContext } from "@/lib/agent/context";
import { normalizeFeatureName } from "@/lib/agent/features";
import {
  buildExtractionPrompt,
  buildJsonRetryMessage,
  extractionResultSchema,
  ModelJsonError,
  parseModelJson,
  type ExtractionResult,
} from "@/lib/agent/prompts";
import { AI_MODELS } from "@/lib/config";
import { db } from "@/lib/db";

/**
 * PRD → feature-map extraction (ai_development_plan.md Step 49).
 *
 * One run reads a page's `contentText` together with the existing per-stack
 * catalog (ids included) and asks the managed model for the features the PRD
 * touches, the links among them, and the PRD's role per feature. Referencing
 * the catalog by id is the primary dedupe; everything written here is
 * SUGGESTED/AGENT and the apply phase is idempotent — re-running a page never
 * duplicates suggestions and never touches CONFIRMED/REJECTED rows.
 *
 * Always runs on the managed server key (background jobs have no user for
 * BYO resolution): quota-checked up front, metered after every model call.
 */

const PAGE_TEXT_CAP = 24_000;
const MAX_OUTPUT_TOKENS = 2_048;
/** Below this the model omits items per the prompt; we enforce it anyway. */
const MIN_CONFIDENCE = 0.4;
/** Pages with less text than this aren't worth a model call. */
const MIN_PAGE_TEXT_CHARS = 40;

export interface ExtractOutcome {
  /** Set when the page was skipped without a model call. */
  skipped?: string;
  newFeatures: number;
  reusedFeatures: number;
  newLinks: number;
  newPageLinks: number;
  /** Entries dropped (hallucinated ids, unknown stacks, low confidence…). */
  droppedItems: number;
}

const EMPTY: Omit<ExtractOutcome, "skipped"> = {
  newFeatures: 0,
  reusedFeatures: 0,
  newLinks: 0,
  newPageLinks: 0,
  droppedItems: 0,
};

function managedClient(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) throw new AiUnavailableError();
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
}

export async function extractPage(opts: {
  workspaceId: string;
  pageId: string;
}): Promise<ExtractOutcome> {
  const page = await db.page.findUnique({
    where: { id: opts.pageId },
    select: {
      workspaceId: true,
      archivedAt: true,
      title: true,
      contentText: true,
    },
  });
  if (!page || page.workspaceId !== opts.workspaceId) {
    return { ...EMPTY, skipped: "page not found in this workspace" };
  }
  if (page.archivedAt) return { ...EMPTY, skipped: "page is archived" };
  const text = page.contentText.trim();
  if (text.length < MIN_PAGE_TEXT_CHARS) {
    return { ...EMPTY, skipped: "page has too little content" };
  }
  const stackCount = await db.stack.count({
    where: { workspaceId: opts.workspaceId },
  });
  if (stackCount === 0) return { ...EMPTY, skipped: "no stacks set up" };

  // Managed-tier guard: throws AiQuotaExceededError → the job fails finally
  // (retrying inside the same billing month can't succeed).
  await assertWithinQuota(opts.workspaceId);

  const client = managedClient();
  const catalog = await buildWorkspaceContext(opts.workspaceId);
  const { system, user } = buildExtractionPrompt({
    pageTitle: page.title || "Untitled",
    pageText:
      text.length > PAGE_TEXT_CAP
        ? `${text.slice(0, PAGE_TEXT_CAP)}\n…[document truncated]`
        : text,
    catalog,
  });

  const call = async (messages: Anthropic.MessageParam[]): Promise<string> => {
    const res = await client.messages.create({
      model: AI_MODELS.managed,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0,
      system,
      messages,
    });
    await recordUsage(opts.workspaceId, {
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
    });
    return res.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
  };

  // One corrective retry on a malformed reply, then give up (job retries).
  const first = await call([{ role: "user", content: user }]);
  let result: ExtractionResult;
  try {
    result = parseModelJson(extractionResultSchema, first);
  } catch (e) {
    if (!(e instanceof ModelJsonError)) throw e;
    const second = await call([
      { role: "user", content: user },
      { role: "assistant", content: first },
      { role: "user", content: buildJsonRetryMessage(e) },
    ]);
    result = parseModelJson(extractionResultSchema, second);
  }

  return applyExtraction(opts.workspaceId, opts.pageId, page.title, result);
}

/**
 * Idempotent apply: resolve every entry to an existing feature where possible
 * (explicit id, then normalized-name match), create the rest as SUGGESTED,
 * and skip any page-join or link whose exact row already exists in ANY
 * status — CONFIRMED stays untouched, REJECTED is never resurrected.
 */
async function applyExtraction(
  workspaceId: string,
  pageId: string,
  pageTitle: string,
  result: ExtractionResult,
): Promise<ExtractOutcome> {
  return db.$transaction(async (tx) => {
    const outcome: ExtractOutcome = { ...EMPTY };

    const [stacks, features] = await Promise.all([
      tx.stack.findMany({ where: { workspaceId }, select: { id: true } }),
      tx.feature.findMany({
        where: { workspaceId, archivedAt: null },
        select: { id: true, stackId: true, name: true },
      }),
    ]);
    const stackIds = new Set(stacks.map((s) => s.id));
    const featureIds = new Set(features.map((f) => f.id));
    const byNormalizedName = new Map(
      features.map((f) => [
        `${f.stackId}:${normalizeFeatureName(f.name)}`,
        f.id,
      ]),
    );

    // Pass 1 — resolve/create features and map the model's local keys.
    const keyToFeatureId = new Map<string, string>();
    const entries: { featureId: string; role: ExtractionResult["features"][number]["role"] }[] = [];

    for (const f of result.features) {
      let featureId: string | null = null;

      if (f.featureId) {
        if (featureIds.has(f.featureId)) {
          featureId = f.featureId;
          outcome.reusedFeatures++;
        } else {
          outcome.droppedItems++; // hallucinated id
          continue;
        }
      } else {
        if (!f.stackId || !stackIds.has(f.stackId)) {
          outcome.droppedItems++;
          continue;
        }
        if (f.confidence !== null && f.confidence < MIN_CONFIDENCE) {
          outcome.droppedItems++;
          continue;
        }
        const nameKey = `${f.stackId}:${normalizeFeatureName(f.name)}`;
        const existing = byNormalizedName.get(nameKey);
        if (existing) {
          featureId = existing;
          outcome.reusedFeatures++;
        } else {
          const created = await tx.feature.create({
            data: {
              workspaceId,
              stackId: f.stackId,
              name: f.name.trim().slice(0, 80),
              summary:
                f.summary.trim() || `Mentioned in “${pageTitle || "Untitled"}”.`,
              status: FeatureStatus.SUGGESTED,
              origin: AgentOrigin.AGENT,
            },
            select: { id: true },
          });
          featureId = created.id;
          featureIds.add(created.id);
          byNormalizedName.set(nameKey, created.id);
          outcome.newFeatures++;
        }
      }

      keyToFeatureId.set(f.key, featureId);
      entries.push({ featureId, role: f.role });
    }

    // Pass 2 — PRD ↔ feature roles (skip if the exact row exists, any status).
    for (const entry of entries) {
      const existing = await tx.pageFeature.findUnique({
        where: {
          pageId_featureId_role: {
            pageId,
            featureId: entry.featureId,
            role: entry.role,
          },
        },
        select: { id: true },
      });
      if (existing) continue;
      await tx.pageFeature.create({
        data: {
          pageId,
          featureId: entry.featureId,
          role: entry.role,
          status: SuggestionStatus.SUGGESTED,
          origin: AgentOrigin.AGENT,
        },
      });
      outcome.newPageLinks++;
    }

    // Pass 3 — feature links (same any-status skip rule).
    for (const link of result.links) {
      const fromId = keyToFeatureId.get(link.fromKey);
      const toId = keyToFeatureId.get(link.toKey);
      if (!fromId || !toId || fromId === toId) {
        outcome.droppedItems++;
        continue;
      }
      if (link.confidence !== null && link.confidence < MIN_CONFIDENCE) {
        outcome.droppedItems++;
        continue;
      }
      const existing = await tx.featureLink.findUnique({
        where: {
          fromFeatureId_toFeatureId_kind: {
            fromFeatureId: fromId,
            toFeatureId: toId,
            kind: link.kind,
          },
        },
        select: { id: true },
      });
      if (existing) continue;
      await tx.featureLink.create({
        data: {
          workspaceId,
          fromFeatureId: fromId,
          toFeatureId: toId,
          kind: link.kind,
          status: SuggestionStatus.SUGGESTED,
          origin: AgentOrigin.AGENT,
          rationale: link.rationale.trim() || null,
          confidence: link.confidence,
        } satisfies Prisma.FeatureLinkUncheckedCreateInput,
      });
      outcome.newLinks++;
    }

    return outcome;
  });
}
