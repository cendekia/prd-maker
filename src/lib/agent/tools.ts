import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import {
  AgentOrigin,
  FeatureLinkKind,
  FeatureStatus,
  PageFeatureRole,
  Role,
  SuggestionStatus,
} from "@prisma/client";
import { z } from "zod";

import { ROLE_RANK } from "@/lib/config";
import { db } from "@/lib/db";
import {
  getFeatureDetail,
  listGraph,
  normalizeFeatureName,
} from "@/lib/agent/features";
import { listStacks } from "@/lib/agent/stacks";
import { FEATURE_LINK_KIND_DESCRIPTIONS } from "@/lib/agent/types";
import { getPageAccess } from "@/lib/permissions";

/**
 * Agent tool layer (ai_development_plan.md Step 47).
 *
 * Security model: `workspaceId`, `userId`, and `role` come from the
 * authenticated session via {@link AgentToolContext} — never from model
 * arguments. Every read re-checks that the addressed row belongs to the
 * context workspace (and, for pages, that the user can access them), so
 * cross-tenant access is impossible by construction. Write tools only ever
 * create `SUGGESTED` rows: the agent proposes, the Step 50 review queue
 * promotes.
 */

export interface AgentToolContext {
  workspaceId: string;
  userId: string;
  role: Role;
}

export type AgentToolResult =
  | { ok: true; content: string }
  | { ok: false; error: string };

/** Max characters of PRD text returned by `read_page` per call. */
const READ_PAGE_CHAR_CAP = 8_000;

const KIND_GLOSSARY = (Object.keys(FEATURE_LINK_KIND_DESCRIPTIONS) as FeatureLinkKind[])
  .map((k) => `${k}: ${FEATURE_LINK_KIND_DESCRIPTIONS[k]}`)
  .join("; ");

interface AgentToolSpec<S extends z.ZodTypeAny = z.ZodTypeAny> {
  definition: Anthropic.Tool;
  /** Reads are member-level; writes (suggestions) require EDITOR+. */
  minRole: Role;
  schema: S;
  run: (ctx: AgentToolContext, args: z.output<S>) => Promise<unknown>;
}

function defineTool<S extends z.ZodTypeAny>(
  spec: AgentToolSpec<S>,
): AgentToolSpec {
  return spec as AgentToolSpec;
}

/* ------------------------------ Read tools ------------------------------ */

const listStacksTool = defineTool({
  definition: {
    name: "list_stacks",
    description:
      "List the application's stacks (deployable surfaces like Frontend, Backend, API) with their ids, types, and feature counts.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  minRole: Role.VIEWER,
  schema: z.object({}),
  async run(ctx) {
    const stacks = await listStacks(ctx.workspaceId);
    return stacks.map((s) => ({
      stackId: s.id,
      name: s.name,
      type: s.type,
      description: s.description,
      featureCount: s.featureCount,
    }));
  },
});

const listFeaturesTool = defineTool({
  definition: {
    name: "list_features",
    description:
      "List features in the workspace map, optionally filtered by stack, status, or a text query over name/summary. Returns ids usable with get_feature and propose_link.",
    input_schema: {
      type: "object",
      properties: {
        stackId: { type: "string", description: "Only features of this stack." },
        query: {
          type: "string",
          description: "Case-insensitive match on name or summary.",
        },
        status: {
          type: "string",
          enum: Object.values(FeatureStatus),
          description: "Only features with this status.",
        },
      },
      required: [],
    },
  },
  minRole: Role.VIEWER,
  schema: z.object({
    stackId: z.string().optional(),
    query: z.string().optional(),
    status: z.enum(FeatureStatus).optional(),
  }),
  async run(ctx, args) {
    const graph = await listGraph(ctx.workspaceId);
    const stackName = new Map(graph.stacks.map((s) => [s.id, s.name]));
    const q = args.query?.trim().toLowerCase();
    const features = graph.features.filter(
      (f) =>
        (!args.stackId || f.stackId === args.stackId) &&
        (!args.status || f.status === args.status) &&
        (!q ||
          f.name.toLowerCase().includes(q) ||
          f.summary.toLowerCase().includes(q)),
    );
    return features.map((f) => ({
      featureId: f.id,
      name: f.name,
      stackId: f.stackId,
      stack: stackName.get(f.stackId) ?? null,
      status: f.status,
      summary: f.summary,
      linkedPrdCount: f.pageCount,
    }));
  },
});

const getFeatureTool = defineTool({
  definition: {
    name: "get_feature",
    description:
      "Get one feature in full: summary, status, its typed links to other features (with direction), and the PRDs connected to it.",
    input_schema: {
      type: "object",
      properties: {
        featureId: { type: "string", description: "Feature id from the map." },
      },
      required: ["featureId"],
    },
  },
  minRole: Role.VIEWER,
  schema: z.object({ featureId: z.string().min(1) }),
  async run(ctx, args) {
    const detail = await getFeatureDetail(args.featureId, ctx.workspaceId);
    if (!detail) throw new Error("Feature not found in this workspace.");
    const stacks = await listStacks(ctx.workspaceId);
    const stack = stacks.find((s) => s.id === detail.feature.stackId);
    return {
      featureId: detail.feature.id,
      name: detail.feature.name,
      stack: stack ? { stackId: stack.id, name: stack.name } : null,
      status: detail.feature.status,
      summary: detail.feature.summary,
      links: detail.links.map((l) => {
        const outgoing = l.fromFeatureId === detail.feature.id;
        const other = outgoing ? l.toFeature : l.fromFeature;
        return {
          linkId: l.id,
          kind: l.kind,
          direction: outgoing ? "outgoing" : "incoming",
          other: { featureId: other.id, name: other.name },
          status: l.status,
          rationale: l.rationale,
        };
      }),
      pages: detail.pages.map((p) => ({
        pageId: p.pageId,
        title: p.title,
        role: p.role,
        status: p.status,
      })),
    };
  },
});

const searchPagesTool = defineTool({
  definition: {
    name: "search_pages",
    description:
      "Search the workspace's PRDs by title. Returns page ids usable with read_page and link_page_feature.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Title text to match." },
      },
      required: ["query"],
    },
  },
  minRole: Role.VIEWER,
  schema: z.object({ query: z.string().min(1) }),
  async run(ctx, args) {
    // Title ILIKE for now — swaps to the Step 22 tsvector FTS when it lands.
    const pages = await db.page.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        archivedAt: null,
        title: { contains: args.query.trim(), mode: "insensitive" },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: { id: true, title: true, updatedAt: true },
    });
    return pages.map((p) => ({
      pageId: p.id,
      title: p.title || "Untitled",
      updatedAt: p.updatedAt.toISOString(),
    }));
  },
});

const readPageTool = defineTool({
  definition: {
    name: "read_page",
    description:
      "Read a PRD's title and plain-text content (capped). Use before making claims about what a PRD says.",
    input_schema: {
      type: "object",
      properties: {
        pageId: { type: "string", description: "Page id from search_pages or the map." },
      },
      required: ["pageId"],
    },
  },
  minRole: Role.VIEWER,
  schema: z.object({ pageId: z.string().min(1) }),
  async run(ctx, args) {
    // Per-page access check (Step 26 semantics) on top of workspace scoping.
    const access = await getPageAccess(args.pageId, ctx.userId);
    if (!access || access.workspaceId !== ctx.workspaceId) {
      throw new Error("Page not found in this workspace.");
    }
    const page = await db.page.findUnique({
      where: { id: args.pageId },
      select: { title: true, contentText: true },
    });
    if (!page) throw new Error("Page not found in this workspace.");
    const text = page.contentText.trim();
    const truncated = text.length > READ_PAGE_CHAR_CAP;
    return {
      pageId: args.pageId,
      title: page.title || "Untitled",
      content: truncated ? text.slice(0, READ_PAGE_CHAR_CAP) : text,
      ...(truncated
        ? { note: `Content truncated — ${text.length - READ_PAGE_CHAR_CAP} more characters not shown.` }
        : {}),
    };
  },
});

/* ------------------------------ Write tools ----------------------------- */
// All writes are SUGGESTED rows — the review queue (Step 50) promotes them.

const proposeFeatureTool = defineTool({
  definition: {
    name: "propose_feature",
    description:
      "Suggest a new feature for a stack. Creates an unconfirmed entry a human reviews later. Always prefer referencing an existing feature id — only propose when nothing in the map matches.",
    input_schema: {
      type: "object",
      properties: {
        stackId: { type: "string", description: "Stack that owns the feature." },
        name: { type: "string", description: "Short feature name, e.g. \"Login endpoint\"." },
        summary: {
          type: "string",
          description: "One or two sentences describing what the feature does.",
        },
      },
      required: ["stackId", "name", "summary"],
    },
  },
  minRole: Role.EDITOR,
  schema: z.object({
    stackId: z.string().min(1),
    name: z.string().min(1).max(80),
    summary: z.string().min(1),
  }),
  async run(ctx, args) {
    const stack = await db.stack.findUnique({
      where: { id: args.stackId },
      select: { workspaceId: true },
    });
    if (!stack || stack.workspaceId !== ctx.workspaceId) {
      throw new Error("Stack not found in this workspace.");
    }

    const normalized = normalizeFeatureName(args.name);
    const siblings = await db.feature.findMany({
      where: { workspaceId: ctx.workspaceId, stackId: args.stackId, archivedAt: null },
      select: { id: true, name: true },
    });
    const existing = siblings.find(
      (s) => normalizeFeatureName(s.name) === normalized,
    );
    if (existing) {
      return {
        featureId: existing.id,
        note: `"${existing.name}" already exists in this stack — reference it by id instead of creating a duplicate.`,
      };
    }

    const created = await db.feature.create({
      data: {
        workspaceId: ctx.workspaceId,
        stackId: args.stackId,
        name: args.name.trim(),
        summary: args.summary.trim(),
        status: FeatureStatus.SUGGESTED,
        origin: AgentOrigin.AGENT,
      },
      select: { id: true },
    });
    return {
      featureId: created.id,
      status: "SUGGESTED",
      note: "Feature suggested — queued for human review in Features → Suggestions.",
    };
  },
});

const proposeLinkTool = defineTool({
  definition: {
    name: "propose_link",
    description: `Suggest a typed, directed link between two existing features (from → to). Kinds — ${KIND_GLOSSARY}. Creates an unconfirmed edge a human reviews later.`,
    input_schema: {
      type: "object",
      properties: {
        fromFeatureId: { type: "string", description: "Source feature id." },
        toFeatureId: { type: "string", description: "Target feature id." },
        kind: { type: "string", enum: Object.values(FeatureLinkKind) },
        rationale: {
          type: "string",
          description: "Why this edge exists — shown to the human reviewer.",
        },
        confidence: {
          type: "number",
          description: "Your 0–1 confidence in the link.",
        },
      },
      required: ["fromFeatureId", "toFeatureId", "kind", "rationale"],
    },
  },
  minRole: Role.EDITOR,
  schema: z.object({
    fromFeatureId: z.string().min(1),
    toFeatureId: z.string().min(1),
    kind: z.enum(FeatureLinkKind),
    rationale: z.string().min(1),
    confidence: z.number().min(0).max(1).optional(),
  }),
  async run(ctx, args) {
    if (args.fromFeatureId === args.toFeatureId) {
      throw new Error("A feature can't link to itself.");
    }
    const [from, to] = await Promise.all([
      db.feature.findUnique({
        where: { id: args.fromFeatureId },
        select: { workspaceId: true },
      }),
      db.feature.findUnique({
        where: { id: args.toFeatureId },
        select: { workspaceId: true },
      }),
    ]);
    if (
      !from ||
      !to ||
      from.workspaceId !== ctx.workspaceId ||
      to.workspaceId !== ctx.workspaceId
    ) {
      throw new Error("Feature not found in this workspace.");
    }

    const existing = await db.featureLink.findUnique({
      where: {
        fromFeatureId_toFeatureId_kind: {
          fromFeatureId: args.fromFeatureId,
          toFeatureId: args.toFeatureId,
          kind: args.kind,
        },
      },
      select: { id: true, status: true },
    });
    if (existing) {
      if (existing.status === SuggestionStatus.REJECTED) {
        return {
          note: "A human previously rejected this exact link — don't re-propose it.",
        };
      }
      return {
        linkId: existing.id,
        note:
          existing.status === SuggestionStatus.CONFIRMED
            ? "These features are already linked (confirmed)."
            : "This link is already suggested and awaiting review.",
      };
    }

    const created = await db.featureLink.create({
      data: {
        workspaceId: ctx.workspaceId,
        fromFeatureId: args.fromFeatureId,
        toFeatureId: args.toFeatureId,
        kind: args.kind,
        status: SuggestionStatus.SUGGESTED,
        origin: AgentOrigin.AGENT,
        rationale: args.rationale.trim(),
        confidence: args.confidence ?? null,
      },
      select: { id: true },
    });
    return {
      linkId: created.id,
      status: "SUGGESTED",
      note: "Link suggested — queued for human review.",
    };
  },
});

const linkPageFeatureTool = defineTool({
  definition: {
    name: "link_page_feature",
    description:
      "Suggest that a PRD DEFINES a feature (specs it), MODIFIES it (change request), or REFERENCES it. Creates an unconfirmed connection a human reviews later.",
    input_schema: {
      type: "object",
      properties: {
        pageId: { type: "string", description: "The PRD's page id." },
        featureId: { type: "string", description: "The feature id." },
        role: { type: "string", enum: Object.values(PageFeatureRole) },
      },
      required: ["pageId", "featureId", "role"],
    },
  },
  minRole: Role.EDITOR,
  schema: z.object({
    pageId: z.string().min(1),
    featureId: z.string().min(1),
    role: z.enum(PageFeatureRole),
  }),
  async run(ctx, args) {
    const access = await getPageAccess(args.pageId, ctx.userId);
    if (!access || access.workspaceId !== ctx.workspaceId) {
      throw new Error("Page not found in this workspace.");
    }
    const feature = await db.feature.findUnique({
      where: { id: args.featureId },
      select: { workspaceId: true },
    });
    if (!feature || feature.workspaceId !== ctx.workspaceId) {
      throw new Error("Feature not found in this workspace.");
    }

    const existing = await db.pageFeature.findUnique({
      where: {
        pageId_featureId_role: {
          pageId: args.pageId,
          featureId: args.featureId,
          role: args.role,
        },
      },
      select: { id: true, status: true },
    });
    if (existing) {
      if (existing.status === SuggestionStatus.REJECTED) {
        return {
          note: "A human previously rejected this exact connection — don't re-propose it.",
        };
      }
      return {
        pageFeatureId: existing.id,
        note:
          existing.status === SuggestionStatus.CONFIRMED
            ? "This PRD↔feature connection already exists (confirmed)."
            : "This connection is already suggested and awaiting review.",
      };
    }

    const created = await db.pageFeature.create({
      data: {
        pageId: args.pageId,
        featureId: args.featureId,
        role: args.role,
        status: SuggestionStatus.SUGGESTED,
        origin: AgentOrigin.AGENT,
      },
      select: { id: true },
    });
    return {
      pageFeatureId: created.id,
      status: "SUGGESTED",
      note: "Connection suggested — queued for human review.",
    };
  },
});

/* ------------------------------ Executor -------------------------------- */

const TOOLS: AgentToolSpec[] = [
  listStacksTool,
  listFeaturesTool,
  getFeatureTool,
  searchPagesTool,
  readPageTool,
  proposeFeatureTool,
  proposeLinkTool,
  linkPageFeatureTool,
];

const registry = new Map(TOOLS.map((t) => [t.definition.name, t]));

/** Tool definitions to pass to the Anthropic Messages API. */
export const AGENT_TOOL_DEFINITIONS: Anthropic.Tool[] = TOOLS.map(
  (t) => t.definition,
);

function summarizeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((i) => `${i.path.join(".") || "input"}: ${i.message}`)
    .join("; ");
}

/**
 * Execute one tool call. Never throws: failures come back as
 * `{ ok: false, error }` so the loop (Step 48) can return them to the model
 * as `tool_result` blocks with `is_error: true`.
 */
export async function executeAgentTool(
  ctx: AgentToolContext,
  name: string,
  input: unknown,
): Promise<AgentToolResult> {
  const tool = registry.get(name);
  if (!tool) {
    return { ok: false, error: `Unknown tool "${name}".` };
  }
  if (ROLE_RANK[ctx.role] < ROLE_RANK[tool.minRole]) {
    return {
      ok: false,
      error: `Your workspace role (${ctx.role}) doesn't allow ${name} — it requires ${tool.minRole}.`,
    };
  }
  const parsed = tool.schema.safeParse(input ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      error: `Invalid arguments for ${name}: ${summarizeIssues(parsed.error)}`,
    };
  }
  try {
    const result = await tool.run(ctx, parsed.data);
    return { ok: true, content: JSON.stringify(result) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
