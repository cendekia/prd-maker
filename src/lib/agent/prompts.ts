import { FeatureLinkKind, PageFeatureRole } from "@prisma/client";
import { z } from "zod";

import {
  FEATURE_LINK_KIND_DESCRIPTIONS,
  IMPACT_KIND_DESCRIPTIONS,
  IMPACT_KINDS,
  IMPACT_SEVERITIES,
  PAGE_FEATURE_ROLE_DESCRIPTIONS,
  type ImpactReport,
} from "@/lib/agent/types";

/**
 * Agent prompt templates + strict JSON output contracts (Step 47).
 * Consumed by extraction jobs (Step 49) and impact runs (Step 52): build the
 * prompt, call the model, then `parseModelJson(schema, reply)` — on a
 * ModelJsonError, retry once with `buildJsonRetryMessage`.
 *
 * Like src/lib/ai-prompts.ts this module is pure (no server-only imports):
 * just strings and zod schemas.
 */

/* --------------------------- Shared glossaries -------------------------- */

const KIND_GLOSSARY = (
  Object.keys(FEATURE_LINK_KIND_DESCRIPTIONS) as FeatureLinkKind[]
)
  .map((k) => `- ${k}: ${FEATURE_LINK_KIND_DESCRIPTIONS[k]}`)
  .join("\n");

const ROLE_GLOSSARY = (
  Object.keys(PAGE_FEATURE_ROLE_DESCRIPTIONS) as PageFeatureRole[]
)
  .map((r) => `- ${r}: ${PAGE_FEATURE_ROLE_DESCRIPTIONS[r]}`)
  .join("\n");

const IMPACT_KIND_GLOSSARY = IMPACT_KINDS.map(
  (k) => `- ${k}: ${IMPACT_KIND_DESCRIPTIONS[k]}`,
).join("\n");

/* ------------------------- Extraction contract -------------------------- */

/**
 * One feature the PRD touches. `key` is a model-chosen local handle that
 * `links` reference, so edges can point at not-yet-created features.
 * `featureId` references an existing catalog entry; when null the entry is a
 * new proposal and `stackId` must be set.
 */
export const extractionFeatureSchema = z.object({
  key: z.string().min(1),
  featureId: z.string().nullable(),
  stackId: z.string().nullable(),
  name: z.string().min(1),
  summary: z.string().default(""),
  role: z.enum(PageFeatureRole),
  confidence: z.number().min(0).max(1).nullable().default(null),
});

export const extractionLinkSchema = z.object({
  fromKey: z.string().min(1),
  toKey: z.string().min(1),
  kind: z.enum(FeatureLinkKind),
  rationale: z.string().default(""),
  confidence: z.number().min(0).max(1).nullable().default(null),
});

export const extractionResultSchema = z.object({
  features: z.array(extractionFeatureSchema).default([]),
  links: z.array(extractionLinkSchema).default([]),
});

export type ExtractionFeature = z.output<typeof extractionFeatureSchema>;
export type ExtractionLink = z.output<typeof extractionLinkSchema>;
export type ExtractionResult = z.output<typeof extractionResultSchema>;

/**
 * Prompt pair for extracting features/links from one PRD (Step 49).
 * `catalog` is the buildWorkspaceContext output — it carries the existing
 * feature/stack ids the model must reference instead of proposing duplicates.
 */
export function buildExtractionPrompt({
  pageTitle,
  pageText,
  catalog,
}: {
  pageTitle: string;
  pageText: string;
  catalog: string;
}): { system: string; user: string } {
  const system = [
    "You extract a product's feature map from PRDs. The workspace is one application built from stacks (frontend, backend, API, websocket, email, …); features belong to exactly one stack and connect across stacks with typed links.",
    "",
    "Link kinds:",
    KIND_GLOSSARY,
    "",
    "PRD-to-feature roles:",
    ROLE_GLOSSARY,
    "",
    "Rules:",
    "- ALWAYS reference an existing catalog feature by its id when the PRD talks about it — only propose a new feature (featureId null) when nothing in the catalog matches. Never duplicate.",
    "- A capability spanning several stacks is one feature PER stack (e.g. a login form in the frontend and a login endpoint in the API), wired with links.",
    "- New features need the owning stackId from the catalog and a crisp one/two-sentence summary.",
    "- Only include links the PRD gives real evidence for; explain each in `rationale`.",
    "- Use `confidence` (0–1) honestly; below 0.4, leave the item out.",
    "Reply with ONLY a JSON object matching exactly:",
    `{"features":[{"key":"<local-handle>","featureId":"<catalog id or null>","stackId":"<stack id when featureId is null, else null>","name":"<name>","summary":"<for new features>","role":"DEFINES|MODIFIES|REFERENCES","confidence":0.0}],"links":[{"fromKey":"<key>","toKey":"<key>","kind":"DEPENDS_ON|CONSUMES|TRIGGERS|EXTENDS|IMPACTS|RELATES_TO","rationale":"<why>","confidence":0.0}]}`,
    "No prose, no markdown fences. Empty arrays are fine when the PRD maps to nothing.",
  ].join("\n");

  const user = [
    "<application_map>",
    catalog,
    "</application_map>",
    "",
    `Extract the feature map of the PRD titled "${pageTitle}":`,
    "<document>",
    pageText.trim() || "(The document is currently empty.)",
    "</document>",
  ].join("\n");

  return { system, user };
}

/* --------------------------- Impact contract ---------------------------- */

const impactFeatureRefSchema = z.object({
  featureId: z.string().nullable(),
  name: z.string(),
});

/**
 * Zod parser for the ImpactReport JSON persisted on `ImpactAnalysis.report`.
 * `satisfies z.ZodType<ImpactReport>` keeps it from drifting away from the
 * interface in src/lib/agent/types.ts.
 */
export const impactReportSchema = z.object({
  summary: z.string(),
  impactedFeatures: z.array(
    z.object({
      featureId: z.string(),
      name: z.string(),
      severity: z.enum(IMPACT_SEVERITIES),
      kind: z.enum(IMPACT_KINDS),
      rationale: z.string(),
    }),
  ),
  suggestedLinks: z.array(
    z.object({
      from: impactFeatureRefSchema,
      to: impactFeatureRefSchema,
      kind: z.enum(FeatureLinkKind),
      rationale: z.string(),
    }),
  ),
  contractNotes: z.array(z.string()),
  openQuestions: z.array(z.string()),
}) satisfies z.ZodType<ImpactReport>;

/**
 * Prompt pair for an impact run (Step 52). `candidateBlock` is the
 * deterministically assembled focus set — the page's linked features and
 * their n-hop neighborhood — rendered as text; `catalog` is the full map so
 * impact outside the neighborhood can still be spotted.
 */
export function buildImpactPrompt({
  pageTitle,
  pageText,
  catalog,
  candidateBlock,
}: {
  pageTitle: string;
  pageText: string;
  catalog: string;
  candidateBlock: string;
}): { system: string; user: string } {
  const system = [
    "You analyze the blast radius of a PRD against an application's feature map. The workspace is one application built from stacks; features connect across stacks with typed links, so a change in one stack ripples into its consumers and triggers.",
    "",
    "Impact kinds:",
    IMPACT_KIND_GLOSSARY,
    "",
    "Severities: LOW (cosmetic / additive), MEDIUM (behavior or contract adjustments consumers must absorb), HIGH (breaking or migration-requiring).",
    "",
    "Link kinds (for suggestedLinks):",
    KIND_GLOSSARY,
    "",
    "Rules:",
    "- `impactedFeatures` may only contain EXISTING features (ids from the map). Echo each feature's exact name. Justify every entry concretely from the PRD; don't pad the list.",
    "- Walk the links: if the PRD changes a feature, its consumers/dependents across stacks are candidates — say which stack each impacted feature lives in inside the rationale.",
    "- `suggestedLinks` proposes graph edges this PRD reveals (new feature wiring or missing existing wiring). Reference existing features by id; for features the PRD introduces that aren't in the map yet, use featureId null and a clear name.",
    "- `contractNotes`: cross-stack contract changes (request/response shapes, events, email payloads) phrased as \"change → who must absorb it\".",
    "- `openQuestions`: what the PRD leaves unanswered that blocks confident impact assessment.",
    "Reply with ONLY a JSON object matching exactly:",
    `{"summary":"<2-3 sentence blast radius>","impactedFeatures":[{"featureId":"<existing id>","name":"<exact name>","severity":"LOW|MEDIUM|HIGH","kind":"CONTRACT|BEHAVIOR|DATA|UX|OTHER","rationale":"<why, incl. stack>"}],"suggestedLinks":[{"from":{"featureId":"<id or null>","name":"<name>"},"to":{"featureId":"<id or null>","name":"<name>"},"kind":"<link kind>","rationale":"<why>"}],"contractNotes":["<note>"],"openQuestions":["<question>"]}`,
    "No prose, no markdown fences.",
  ].join("\n");

  const user = [
    "<application_map>",
    catalog,
    "</application_map>",
    "",
    "<focus_features>",
    candidateBlock.trim() || "(This PRD has no confirmed feature connections yet — assess against the whole map.)",
    "</focus_features>",
    "",
    `Analyze the impact of the PRD titled "${pageTitle}":`,
    "<document>",
    pageText.trim() || "(The document is currently empty.)",
    "</document>",
  ].join("\n");

  return { system, user };
}

/* ----------------------------- JSON parsing ----------------------------- */

export class ModelJsonError extends Error {
  /** The model's raw reply, for logging / the retry message. */
  readonly raw: string;

  constructor(message: string, raw: string) {
    super(message);
    this.name = "ModelJsonError";
    this.raw = raw;
  }
}

function summarizeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
    .join("; ");
}

/**
 * Parse a model reply against a contract. Tolerates markdown fences and
 * leading/trailing prose by slicing the outermost JSON object. Throws
 * ModelJsonError on failure — callers retry once with
 * {@link buildJsonRetryMessage} and give up after that.
 */
export function parseModelJson<T>(schema: z.ZodType<T>, raw: string): T {
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new ModelJsonError("No JSON object found in the reply.", raw);
  }

  let data: unknown;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    throw new ModelJsonError(`Invalid JSON: ${(e as Error).message}`, raw);
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new ModelJsonError(
      `JSON doesn't match the contract: ${summarizeIssues(parsed.error)}`,
      raw,
    );
  }
  return parsed.data;
}

/** Corrective follow-up message for the one retry after a ModelJsonError. */
export function buildJsonRetryMessage(error: ModelJsonError): string {
  return [
    `Your previous reply couldn't be used: ${error.message}`,
    "Reply again with ONLY the corrected JSON object — no prose, no markdown fences, exactly matching the required structure.",
  ].join("\n");
}
