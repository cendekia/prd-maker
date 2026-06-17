import "server-only";

import {
  AgentOrigin,
  FeatureLinkKind,
  FeatureStatus,
  PageFeatureRole,
  Prisma,
  Role,
  SuggestionStatus,
} from "@prisma/client";

import { ROLE_RANK } from "@/lib/config";
import { db } from "@/lib/db";
import { listStacks } from "@/lib/agent/stacks";
import type {
  FeatureDetail,
  FeatureDetailLink,
  FeatureEdge,
  FeatureNode,
  PageFeatureItem,
  SuggestedFeatureItem,
  SuggestedLinkItem,
  SuggestedPageLinkItem,
  SuggestionCounts,
  SuggestionQueue,
  WorkspaceGraph,
} from "@/lib/agent/types";

/**
 * Feature-graph service (ai_development_plan.md Step 46). Nodes (Feature),
 * typed edges (FeatureLink), and PRD joins (PageFeature) — the workspace
 * mind map. Human writes here are born canonical (ACTIVE / CONFIRMED, origin
 * MANUAL); only the agent (Steps 47–49) writes SUGGESTED rows. REJECTED rows
 * are kept in the DB to stop re-proposal but never served to the UI.
 */

/** Throws if `actorRole` is below `min`. Mirrors the helper in epics.ts. */
function requireRoleOnWorkspace(actorRole: Role, min: Role) {
  if (ROLE_RANK[actorRole] < ROLE_RANK[min]) {
    throw new Error(`Requires ${min}; have ${actorRole}.`);
  }
}

const featureSelect = {
  id: true,
  stackId: true,
  name: true,
  summary: true,
  status: true,
  origin: true,
  archivedAt: true,
} as const;

const linkSelect = {
  id: true,
  fromFeatureId: true,
  toFeatureId: true,
  kind: true,
  status: true,
  origin: true,
  confidence: true,
  rationale: true,
} as const;

const linkEndpointSelect = {
  id: true,
  name: true,
  stackId: true,
} as const;

type FeatureRow = Prisma.FeatureGetPayload<{ select: typeof featureSelect }>;

function toNode(row: FeatureRow, pageCount: number): FeatureNode {
  return {
    id: row.id,
    stackId: row.stackId,
    name: row.name,
    summary: row.summary,
    status: row.status,
    origin: row.origin,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    pageCount,
  };
}

/** Case/whitespace-insensitive form used for the per-stack duplicate check. */
export function normalizeFeatureName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

async function assertNameAvailable(
  workspaceId: string,
  stackId: string,
  name: string,
  excludeFeatureId?: string,
) {
  const normalized = normalizeFeatureName(name);
  const siblings = await db.feature.findMany({
    where: { workspaceId, stackId, archivedAt: null },
    select: { id: true, name: true },
  });
  const clash = siblings.find(
    (s) =>
      s.id !== excludeFeatureId && normalizeFeatureName(s.name) === normalized,
  );
  if (clash) {
    throw new Error(`“${clash.name}” already exists in this stack.`);
  }
}

async function pageCountFor(featureId: string): Promise<number> {
  return db.pageFeature.count({
    where: {
      featureId,
      status: { not: SuggestionStatus.REJECTED },
      page: { archivedAt: null },
    },
  });
}

// ───────────────────────────────────────────── Graph queries

/**
 * The whole workspace graph — stacks (position-ordered), non-archived
 * features, and non-rejected links. Payload of the Features surface and map.
 */
export async function listGraph(workspaceId: string): Promise<WorkspaceGraph> {
  const [stacks, features, links, pageCounts] = await Promise.all([
    listStacks(workspaceId),
    db.feature.findMany({
      where: { workspaceId, archivedAt: null },
      orderBy: [{ name: "asc" }],
      select: featureSelect,
    }),
    db.featureLink.findMany({
      where: { workspaceId, status: { not: SuggestionStatus.REJECTED } },
      orderBy: { createdAt: "asc" },
      select: linkSelect,
    }),
    db.pageFeature.groupBy({
      by: ["featureId"],
      where: {
        feature: { workspaceId },
        status: { not: SuggestionStatus.REJECTED },
        page: { archivedAt: null },
      },
      _count: { _all: true },
    }),
  ]);

  const counts = new Map(pageCounts.map((c) => [c.featureId, c._count._all]));
  return {
    stacks,
    features: features.map((f) => toNode(f, counts.get(f.id) ?? 0)),
    links,
  };
}

/** Feature + resolved links + linked PRDs. Null if not in this workspace. */
export async function getFeatureDetail(
  featureId: string,
  workspaceId: string,
): Promise<FeatureDetail | null> {
  const row = await db.feature.findUnique({
    where: { id: featureId },
    select: { ...featureSelect, workspaceId: true },
  });
  if (!row || row.workspaceId !== workspaceId) return null;

  const [links, pageLinks, pageCount] = await Promise.all([
    db.featureLink.findMany({
      where: {
        OR: [{ fromFeatureId: featureId }, { toFeatureId: featureId }],
        status: { not: SuggestionStatus.REJECTED },
      },
      orderBy: { createdAt: "asc" },
      select: {
        ...linkSelect,
        fromFeature: { select: linkEndpointSelect },
        toFeature: { select: linkEndpointSelect },
      },
    }),
    db.pageFeature.findMany({
      where: {
        featureId,
        status: { not: SuggestionStatus.REJECTED },
        page: { archivedAt: null },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        pageId: true,
        role: true,
        status: true,
        origin: true,
        page: { select: { title: true } },
      },
    }),
    pageCountFor(featureId),
  ]);

  return {
    feature: toNode(row, pageCount),
    links,
    pages: pageLinks.map((p) => ({
      id: p.id,
      pageId: p.pageId,
      title: p.page.title || "Untitled",
      role: p.role,
      status: p.status,
      origin: p.origin,
    })),
  };
}

/** All non-rejected links touching a feature (Step 47 `get_feature` tool). */
export async function neighbors(
  workspaceId: string,
  featureId: string,
): Promise<FeatureEdge[]> {
  return db.featureLink.findMany({
    where: {
      workspaceId,
      status: { not: SuggestionStatus.REJECTED },
      OR: [{ fromFeatureId: featureId }, { toFeatureId: featureId }],
    },
    select: linkSelect,
  });
}

/**
 * N-hop neighborhood: BFS from `seedIds` over non-rejected links, walked in
 * memory — workspace catalogs are small by design (see plan brainstorming).
 * Returns every feature id reached within `depth` hops plus the links crossed.
 * Used by the map's focus mode (Step 51) and impact candidates (Step 52).
 */
export async function subgraph(
  workspaceId: string,
  seedIds: string[],
  depth: number,
): Promise<{ featureIds: string[]; links: FeatureEdge[] }> {
  const links = await db.featureLink.findMany({
    where: { workspaceId, status: { not: SuggestionStatus.REJECTED } },
    select: linkSelect,
  });

  const adjacency = new Map<string, FeatureEdge[]>();
  for (const link of links) {
    for (const end of [link.fromFeatureId, link.toFeatureId]) {
      const list = adjacency.get(end);
      if (list) list.push(link);
      else adjacency.set(end, [link]);
    }
  }

  const reached = new Set(seedIds);
  const crossed = new Map<string, FeatureEdge>();
  let frontier = seedIds;
  for (let hop = 0; hop < depth && frontier.length > 0; hop++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const link of adjacency.get(id) ?? []) {
        crossed.set(link.id, link);
        const other =
          link.fromFeatureId === id ? link.toFeatureId : link.fromFeatureId;
        if (!reached.has(other)) {
          reached.add(other);
          next.push(other);
        }
      }
    }
    frontier = next;
  }

  return { featureIds: [...reached], links: [...crossed.values()] };
}

// ───────────────────────────────────────────── Feature mutations

interface CreateFeatureInput {
  workspaceId: string;
  actorId: string;
  actorRole: Role;
  stackId: string;
  name: string;
  summary: string;
}

/** Manual create — born ACTIVE/MANUAL (canonical, no review needed). */
export async function createFeature(
  input: CreateFeatureInput,
): Promise<FeatureNode> {
  requireRoleOnWorkspace(input.actorRole, Role.EDITOR);
  const name = input.name.trim();
  const summary = input.summary.trim();
  if (!name || name.length > 80) {
    throw new Error("Feature name must be 1–80 characters.");
  }
  if (!summary) {
    throw new Error(
      "Add a one-line summary — it's what the agent reads about this feature.",
    );
  }

  const stack = await db.stack.findUnique({
    where: { id: input.stackId },
    select: { workspaceId: true },
  });
  if (!stack || stack.workspaceId !== input.workspaceId) {
    throw new Error("Stack not found.");
  }
  await assertNameAvailable(input.workspaceId, input.stackId, name);

  const row = await db.feature.create({
    data: {
      workspaceId: input.workspaceId,
      stackId: input.stackId,
      name,
      summary,
      status: FeatureStatus.ACTIVE,
      origin: AgentOrigin.MANUAL,
      createdById: input.actorId,
    },
    select: featureSelect,
  });
  return toNode(row, 0);
}

interface UpdateFeatureInput {
  featureId: string;
  workspaceId: string;
  actorRole: Role;
  name?: string;
  summary?: string;
  status?: FeatureStatus;
  stackId?: string;
  archived?: boolean;
}

export async function updateFeature(
  input: UpdateFeatureInput,
): Promise<FeatureNode> {
  requireRoleOnWorkspace(input.actorRole, Role.EDITOR);
  const existing = await db.feature.findUnique({
    where: { id: input.featureId },
    select: { workspaceId: true, stackId: true, name: true },
  });
  if (!existing || existing.workspaceId !== input.workspaceId) {
    throw new Error("Feature not found.");
  }

  const data: Prisma.FeatureUpdateInput = {};
  const targetStackId = input.stackId ?? existing.stackId;

  if (input.stackId !== undefined && input.stackId !== existing.stackId) {
    const stack = await db.stack.findUnique({
      where: { id: input.stackId },
      select: { workspaceId: true },
    });
    if (!stack || stack.workspaceId !== input.workspaceId) {
      throw new Error("Stack not found.");
    }
    data.stack = { connect: { id: input.stackId } };
  }
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name || name.length > 80) {
      throw new Error("Feature name must be 1–80 characters.");
    }
    data.name = name;
  }
  // Re-check the duplicate rule whenever the (name, stack) pair changes.
  if (input.name !== undefined || input.stackId !== undefined) {
    await assertNameAvailable(
      input.workspaceId,
      targetStackId,
      input.name ?? existing.name,
      input.featureId,
    );
  }
  if (input.summary !== undefined) {
    const summary = input.summary.trim();
    if (!summary) throw new Error("Summary can't be empty.");
    data.summary = summary;
  }
  if (input.status !== undefined) data.status = input.status;
  if (input.archived !== undefined) {
    data.archivedAt = input.archived ? new Date() : null;
  }

  const row = await db.feature.update({
    where: { id: input.featureId },
    data,
    select: featureSelect,
  });
  return toNode(row, await pageCountFor(input.featureId));
}

interface DeleteFeatureInput {
  featureId: string;
  workspaceId: string;
  actorRole: Role;
}

/** Hard delete (OWNER). Links and PRD joins cascade at the DB level. */
export async function deleteFeature(input: DeleteFeatureInput): Promise<void> {
  requireRoleOnWorkspace(input.actorRole, Role.OWNER);
  const feature = await db.feature.findUnique({
    where: { id: input.featureId },
    select: { workspaceId: true },
  });
  if (!feature || feature.workspaceId !== input.workspaceId) {
    throw new Error("Feature not found.");
  }
  await db.feature.delete({ where: { id: input.featureId } });
}

// ───────────────────────────────────────────── Link mutations

const linkDetailSelect = {
  ...linkSelect,
  fromFeature: { select: linkEndpointSelect },
  toFeature: { select: linkEndpointSelect },
} as const;

interface CreateLinkInput {
  workspaceId: string;
  actorRole: Role;
  fromFeatureId: string;
  toFeatureId: string;
  kind: FeatureLinkKind;
  rationale?: string | null;
}

/**
 * Manual link — born CONFIRMED/MANUAL. If the same (from, to, kind) triple
 * already exists as SUGGESTED or REJECTED, it's promoted in place instead of
 * tripping the unique constraint.
 */
export async function createLink(
  input: CreateLinkInput,
): Promise<FeatureDetailLink> {
  requireRoleOnWorkspace(input.actorRole, Role.EDITOR);
  if (input.fromFeatureId === input.toFeatureId) {
    throw new Error("A feature can't link to itself.");
  }

  const [from, to] = await Promise.all([
    db.feature.findUnique({
      where: { id: input.fromFeatureId },
      select: { workspaceId: true },
    }),
    db.feature.findUnique({
      where: { id: input.toFeatureId },
      select: { workspaceId: true },
    }),
  ]);
  if (
    !from ||
    !to ||
    from.workspaceId !== input.workspaceId ||
    to.workspaceId !== input.workspaceId
  ) {
    throw new Error("Feature not found.");
  }

  const rationale = input.rationale?.trim() || null;
  const existing = await db.featureLink.findUnique({
    where: {
      fromFeatureId_toFeatureId_kind: {
        fromFeatureId: input.fromFeatureId,
        toFeatureId: input.toFeatureId,
        kind: input.kind,
      },
    },
    select: { id: true, status: true },
  });

  if (existing) {
    if (existing.status === SuggestionStatus.CONFIRMED) {
      throw new Error("These features are already linked with this kind.");
    }
    return db.featureLink.update({
      where: { id: existing.id },
      data: {
        status: SuggestionStatus.CONFIRMED,
        origin: AgentOrigin.MANUAL,
        confidence: null,
        ...(rationale ? { rationale } : {}),
      },
      select: linkDetailSelect,
    });
  }

  return db.featureLink.create({
    data: {
      workspaceId: input.workspaceId,
      fromFeatureId: input.fromFeatureId,
      toFeatureId: input.toFeatureId,
      kind: input.kind,
      status: SuggestionStatus.CONFIRMED,
      origin: AgentOrigin.MANUAL,
      rationale,
    },
    select: linkDetailSelect,
  });
}

interface UpdateLinkInput {
  linkId: string;
  workspaceId: string;
  actorRole: Role;
  kind?: FeatureLinkKind;
  rationale?: string | null;
}

export async function updateLink(
  input: UpdateLinkInput,
): Promise<FeatureDetailLink> {
  requireRoleOnWorkspace(input.actorRole, Role.EDITOR);
  const link = await db.featureLink.findUnique({
    where: { id: input.linkId },
    select: { workspaceId: true },
  });
  if (!link || link.workspaceId !== input.workspaceId) {
    throw new Error("Link not found.");
  }

  const data: Prisma.FeatureLinkUpdateInput = {};
  if (input.kind !== undefined) data.kind = input.kind;
  if (input.rationale !== undefined) {
    data.rationale = input.rationale?.trim() || null;
  }

  try {
    return await db.featureLink.update({
      where: { id: input.linkId },
      data,
      select: linkDetailSelect,
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      throw new Error("These features are already linked with this kind.");
    }
    throw e;
  }
}

interface DeleteLinkInput {
  linkId: string;
  workspaceId: string;
  actorRole: Role;
}

export async function deleteLink(input: DeleteLinkInput): Promise<void> {
  requireRoleOnWorkspace(input.actorRole, Role.EDITOR);
  const link = await db.featureLink.findUnique({
    where: { id: input.linkId },
    select: { workspaceId: true },
  });
  if (!link || link.workspaceId !== input.workspaceId) {
    throw new Error("Link not found.");
  }
  await db.featureLink.delete({ where: { id: input.linkId } });
}

// ─────────────────────────── Suggestion review (Step 50)
// The human-in-the-loop gate: everything the agent wrote sits here as
// SUGGESTED until someone accepts (feature → ACTIVE, link/join → CONFIRMED),
// rejects (REJECTED rows stay as tombstones so nothing re-proposes them;
// rejected features tombstone via archivedAt since FeatureStatus has no
// REJECTED), or merges a duplicate feature into an existing one.

/** Everything pending review, grouped. */
export async function getSuggestionQueue(
  workspaceId: string,
): Promise<SuggestionQueue> {
  const [features, links, pageLinks] = await Promise.all([
    db.feature.findMany({
      where: {
        workspaceId,
        status: FeatureStatus.SUGGESTED,
        archivedAt: null,
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        summary: true,
        stackId: true,
        createdAt: true,
        pageLinks: {
          where: {
            status: { not: SuggestionStatus.REJECTED },
            page: { archivedAt: null },
          },
          select: { pageId: true, page: { select: { title: true } } },
        },
      },
    }),
    db.featureLink.findMany({
      where: {
        workspaceId,
        status: SuggestionStatus.SUGGESTED,
        fromFeature: { archivedAt: null },
        toFeature: { archivedAt: null },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        kind: true,
        confidence: true,
        rationale: true,
        createdAt: true,
        fromFeature: { select: { id: true, name: true, status: true } },
        toFeature: { select: { id: true, name: true, status: true } },
      },
    }),
    db.pageFeature.findMany({
      where: {
        status: SuggestionStatus.SUGGESTED,
        page: { archivedAt: null },
        feature: { workspaceId, archivedAt: null },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        role: true,
        createdAt: true,
        pageId: true,
        page: { select: { title: true } },
        feature: { select: { id: true, name: true, status: true } },
      },
    }),
  ]);

  const featureItems: SuggestedFeatureItem[] = features.map((f) => ({
    id: f.id,
    name: f.name,
    summary: f.summary,
    stackId: f.stackId,
    createdAt: f.createdAt.toISOString(),
    pages: dedupePages(
      f.pageLinks.map((p) => ({
        pageId: p.pageId,
        title: p.page.title || "Untitled",
      })),
    ),
  }));
  const linkItems: SuggestedLinkItem[] = links.map((l) => ({
    id: l.id,
    kind: l.kind,
    confidence: l.confidence,
    rationale: l.rationale,
    createdAt: l.createdAt.toISOString(),
    from: l.fromFeature,
    to: l.toFeature,
  }));
  const pageLinkItems: SuggestedPageLinkItem[] = pageLinks.map((p) => ({
    id: p.id,
    role: p.role,
    createdAt: p.createdAt.toISOString(),
    pageId: p.pageId,
    pageTitle: p.page.title || "Untitled",
    featureId: p.feature.id,
    featureName: p.feature.name,
    featureStatus: p.feature.status,
  }));

  return { features: featureItems, links: linkItems, pageLinks: pageLinkItems };
}

function dedupePages(
  pages: { pageId: string; title: string }[],
): { pageId: string; title: string }[] {
  const seen = new Set<string>();
  return pages.filter((p) =>
    seen.has(p.pageId) ? false : (seen.add(p.pageId), true),
  );
}

export async function getSuggestionCounts(
  workspaceId: string,
): Promise<SuggestionCounts> {
  const [features, links, pageLinks] = await Promise.all([
    db.feature.count({
      where: { workspaceId, status: FeatureStatus.SUGGESTED, archivedAt: null },
    }),
    db.featureLink.count({
      where: {
        workspaceId,
        status: SuggestionStatus.SUGGESTED,
        fromFeature: { archivedAt: null },
        toFeature: { archivedAt: null },
      },
    }),
    db.pageFeature.count({
      where: {
        status: SuggestionStatus.SUGGESTED,
        page: { archivedAt: null },
        feature: { workspaceId, archivedAt: null },
      },
    }),
  ]);
  return { features, links, pageLinks, total: features + links + pageLinks };
}

/** Sidebar badge helper — one number, same filters as the queue. */
export async function countPendingSuggestions(
  workspaceId: string,
): Promise<number> {
  return (await getSuggestionCounts(workspaceId)).total;
}

interface ResolveFeatureInput {
  workspaceId: string;
  actorRole: Role;
  featureId: string;
  action: "accept" | "reject";
  /** Optional fixes applied on accept. */
  edits?: { name?: string; summary?: string; stackId?: string };
}

export async function resolveSuggestedFeature(
  input: ResolveFeatureInput,
): Promise<void> {
  requireRoleOnWorkspace(input.actorRole, Role.EDITOR);
  const feature = await db.feature.findUnique({
    where: { id: input.featureId },
    select: {
      workspaceId: true,
      status: true,
      archivedAt: true,
      stackId: true,
      name: true,
    },
  });
  if (
    !feature ||
    feature.workspaceId !== input.workspaceId ||
    feature.status !== FeatureStatus.SUGGESTED ||
    feature.archivedAt
  ) {
    throw new Error("This suggestion is no longer pending.");
  }

  if (input.action === "reject") {
    // Tombstone the feature (archived suggestion = rejected; extraction and
    // propose_feature both refuse to re-propose archived names) and park its
    // dependent suggestions so they don't dangle in the queue.
    await db.$transaction([
      db.feature.update({
        where: { id: input.featureId },
        data: { archivedAt: new Date() },
      }),
      db.featureLink.updateMany({
        where: {
          status: SuggestionStatus.SUGGESTED,
          OR: [
            { fromFeatureId: input.featureId },
            { toFeatureId: input.featureId },
          ],
        },
        data: { status: SuggestionStatus.REJECTED },
      }),
      db.pageFeature.updateMany({
        where: {
          featureId: input.featureId,
          status: SuggestionStatus.SUGGESTED,
        },
        data: { status: SuggestionStatus.REJECTED },
      }),
    ]);
    return;
  }

  const data: Prisma.FeatureUpdateInput = { status: FeatureStatus.ACTIVE };
  const targetStackId = input.edits?.stackId ?? feature.stackId;
  if (input.edits?.stackId && input.edits.stackId !== feature.stackId) {
    const stack = await db.stack.findUnique({
      where: { id: input.edits.stackId },
      select: { workspaceId: true },
    });
    if (!stack || stack.workspaceId !== input.workspaceId) {
      throw new Error("Stack not found.");
    }
    data.stack = { connect: { id: input.edits.stackId } };
  }
  if (input.edits?.name !== undefined) {
    const name = input.edits.name.trim();
    if (!name || name.length > 80) {
      throw new Error("Feature name must be 1–80 characters.");
    }
    data.name = name;
  }
  if (input.edits?.name !== undefined || input.edits?.stackId !== undefined) {
    await assertNameAvailable(
      input.workspaceId,
      targetStackId,
      input.edits?.name ?? feature.name,
      input.featureId,
    );
  }
  if (input.edits?.summary !== undefined) {
    const summary = input.edits.summary.trim();
    if (!summary) throw new Error("Summary can't be empty.");
    data.summary = summary;
  }
  await db.feature.update({ where: { id: input.featureId }, data });
}

interface ResolveLinkInput {
  workspaceId: string;
  actorRole: Role;
  linkId: string;
  action: "accept" | "reject";
  /** Optional kind fix applied on accept. */
  kind?: FeatureLinkKind;
}

export async function resolveSuggestedLink(
  input: ResolveLinkInput,
): Promise<void> {
  requireRoleOnWorkspace(input.actorRole, Role.EDITOR);
  const link = await db.featureLink.findUnique({
    where: { id: input.linkId },
    select: {
      workspaceId: true,
      status: true,
      kind: true,
      fromFeatureId: true,
      toFeatureId: true,
      fromFeature: { select: { status: true, archivedAt: true } },
      toFeature: { select: { status: true, archivedAt: true } },
    },
  });
  if (
    !link ||
    link.workspaceId !== input.workspaceId ||
    link.status !== SuggestionStatus.SUGGESTED
  ) {
    throw new Error("This suggestion is no longer pending.");
  }

  if (input.action === "reject") {
    await db.featureLink.update({
      where: { id: input.linkId },
      data: { status: SuggestionStatus.REJECTED },
    });
    return;
  }

  if (input.kind && input.kind !== link.kind) {
    const clash = await db.featureLink.findUnique({
      where: {
        fromFeatureId_toFeatureId_kind: {
          fromFeatureId: link.fromFeatureId,
          toFeatureId: link.toFeatureId,
          kind: input.kind,
        },
      },
      select: { id: true },
    });
    if (clash) {
      throw new Error(
        "These features already have a link of that kind — act on that card instead.",
      );
    }
  }

  // Confirming an edge implies its endpoints are real: cascade-activate any
  // still-suggested endpoint feature.
  await db.$transaction([
    db.featureLink.update({
      where: { id: input.linkId },
      data: {
        status: SuggestionStatus.CONFIRMED,
        ...(input.kind ? { kind: input.kind } : {}),
      },
    }),
    db.feature.updateMany({
      where: {
        id: { in: [link.fromFeatureId, link.toFeatureId] },
        status: FeatureStatus.SUGGESTED,
        archivedAt: null,
      },
      data: { status: FeatureStatus.ACTIVE },
    }),
  ]);
}

interface ResolvePageLinkInput {
  workspaceId: string;
  actorRole: Role;
  pageFeatureId: string;
  action: "accept" | "reject";
  /** Optional role fix applied on accept. */
  role?: PageFeatureRole;
}

export async function resolveSuggestedPageLink(
  input: ResolvePageLinkInput,
): Promise<void> {
  requireRoleOnWorkspace(input.actorRole, Role.EDITOR);
  const join = await db.pageFeature.findUnique({
    where: { id: input.pageFeatureId },
    select: {
      status: true,
      role: true,
      pageId: true,
      featureId: true,
      feature: { select: { workspaceId: true, status: true, archivedAt: true } },
    },
  });
  if (
    !join ||
    join.feature.workspaceId !== input.workspaceId ||
    join.status !== SuggestionStatus.SUGGESTED
  ) {
    throw new Error("This suggestion is no longer pending.");
  }

  if (input.action === "reject") {
    await db.pageFeature.update({
      where: { id: input.pageFeatureId },
      data: { status: SuggestionStatus.REJECTED },
    });
    return;
  }

  if (input.role && input.role !== join.role) {
    const clash = await db.pageFeature.findUnique({
      where: {
        pageId_featureId_role: {
          pageId: join.pageId,
          featureId: join.featureId,
          role: input.role,
        },
      },
      select: { id: true },
    });
    if (clash) {
      throw new Error(
        "This PRD is already connected with that role — act on that card instead.",
      );
    }
  }

  await db.$transaction([
    db.pageFeature.update({
      where: { id: input.pageFeatureId },
      data: {
        status: SuggestionStatus.CONFIRMED,
        ...(input.role ? { role: input.role } : {}),
      },
    }),
    db.feature.updateMany({
      where: {
        id: join.featureId,
        status: FeatureStatus.SUGGESTED,
        archivedAt: null,
      },
      data: { status: FeatureStatus.ACTIVE },
    }),
  ]);
}

interface MergeFeatureInput {
  workspaceId: string;
  actorRole: Role;
  /** The suggested duplicate being merged away. */
  featureId: string;
  /** The feature that absorbs its links and PRD connections. */
  targetFeatureId: string;
}

/**
 * Merge a suggested duplicate into an existing feature: every link and PRD
 * join is re-pointed at the target (rows that would collide with an existing
 * triple are dropped, would-be self-links removed), then the duplicate is
 * archived — which also tombstones its name against re-proposal.
 */
export async function mergeSuggestedFeature(
  input: MergeFeatureInput,
): Promise<void> {
  requireRoleOnWorkspace(input.actorRole, Role.EDITOR);
  if (input.featureId === input.targetFeatureId) {
    throw new Error("Pick a different feature to merge into.");
  }
  const [source, target] = await Promise.all([
    db.feature.findUnique({
      where: { id: input.featureId },
      select: { workspaceId: true, status: true, archivedAt: true },
    }),
    db.feature.findUnique({
      where: { id: input.targetFeatureId },
      select: { workspaceId: true, archivedAt: true },
    }),
  ]);
  if (
    !source ||
    source.workspaceId !== input.workspaceId ||
    source.status !== FeatureStatus.SUGGESTED ||
    source.archivedAt
  ) {
    throw new Error("This suggestion is no longer pending.");
  }
  if (
    !target ||
    target.workspaceId !== input.workspaceId ||
    target.archivedAt
  ) {
    throw new Error("Merge target not found.");
  }

  await db.$transaction(async (tx) => {
    const links = await tx.featureLink.findMany({
      where: {
        OR: [
          { fromFeatureId: input.featureId },
          { toFeatureId: input.featureId },
        ],
      },
      select: {
        id: true,
        fromFeatureId: true,
        toFeatureId: true,
        kind: true,
      },
    });
    for (const link of links) {
      const newFrom =
        link.fromFeatureId === input.featureId
          ? input.targetFeatureId
          : link.fromFeatureId;
      const newTo =
        link.toFeatureId === input.featureId
          ? input.targetFeatureId
          : link.toFeatureId;
      if (newFrom === newTo) {
        await tx.featureLink.delete({ where: { id: link.id } });
        continue;
      }
      const clash = await tx.featureLink.findUnique({
        where: {
          fromFeatureId_toFeatureId_kind: {
            fromFeatureId: newFrom,
            toFeatureId: newTo,
            kind: link.kind,
          },
        },
        select: { id: true },
      });
      if (clash && clash.id !== link.id) {
        await tx.featureLink.delete({ where: { id: link.id } });
      } else {
        await tx.featureLink.update({
          where: { id: link.id },
          data: { fromFeatureId: newFrom, toFeatureId: newTo },
        });
      }
    }

    const joins = await tx.pageFeature.findMany({
      where: { featureId: input.featureId },
      select: { id: true, pageId: true, role: true },
    });
    for (const join of joins) {
      const clash = await tx.pageFeature.findUnique({
        where: {
          pageId_featureId_role: {
            pageId: join.pageId,
            featureId: input.targetFeatureId,
            role: join.role,
          },
        },
        select: { id: true },
      });
      if (clash) {
        await tx.pageFeature.delete({ where: { id: join.id } });
      } else {
        await tx.pageFeature.update({
          where: { id: join.id },
          data: { featureId: input.targetFeatureId },
        });
      }
    }

    await tx.feature.update({
      where: { id: input.featureId },
      data: { archivedAt: new Date() },
    });
  });
}

// ─────────────────────────── PRD ↔ feature joins (Step 52)
// The properties-bar Features field: humans connect a PRD to the features it
// DEFINES or MODIFIES (= change request). Human writes are born
// CONFIRMED/MANUAL, mirroring the link semantics in createLink.

const pageFeatureItemSelect = {
  id: true,
  role: true,
  status: true,
  origin: true,
  feature: {
    select: {
      id: true,
      name: true,
      stackId: true,
      stack: { select: { name: true, color: true } },
    },
  },
} as const;

type PageFeatureRow = Prisma.PageFeatureGetPayload<{
  select: typeof pageFeatureItemSelect;
}>;

function toPageFeatureItem(row: PageFeatureRow): PageFeatureItem {
  return {
    id: row.id,
    featureId: row.feature.id,
    name: row.feature.name,
    stackId: row.feature.stackId,
    stackName: row.feature.stack.name,
    stackColor: row.feature.stack.color,
    role: row.role,
    status: row.status,
    origin: row.origin,
  };
}

/** A PRD's feature connections (pending + confirmed; rejected hidden). */
export async function listPageFeatures(
  pageId: string,
  workspaceId: string,
): Promise<PageFeatureItem[]> {
  const rows = await db.pageFeature.findMany({
    where: {
      pageId,
      status: { not: SuggestionStatus.REJECTED },
      feature: { workspaceId, archivedAt: null },
    },
    orderBy: { createdAt: "asc" },
    select: pageFeatureItemSelect,
  });
  return rows.map(toPageFeatureItem);
}

interface SetPageFeatureInput {
  workspaceId: string;
  actorRole: Role;
  pageId: string;
  featureId: string;
  role: PageFeatureRole;
}

/**
 * Human-set PRD↔feature connection — born CONFIRMED/MANUAL. An existing
 * SUGGESTED/REJECTED row for the same triple is promoted in place, and
 * connecting a still-suggested feature implicitly activates it.
 */
export async function setPageFeature(
  input: SetPageFeatureInput,
): Promise<PageFeatureItem> {
  requireRoleOnWorkspace(input.actorRole, Role.EDITOR);
  const [page, feature] = await Promise.all([
    db.page.findUnique({
      where: { id: input.pageId },
      select: { workspaceId: true, archivedAt: true },
    }),
    db.feature.findUnique({
      where: { id: input.featureId },
      select: { workspaceId: true, archivedAt: true, status: true },
    }),
  ]);
  if (!page || page.workspaceId !== input.workspaceId || page.archivedAt) {
    throw new Error("Page not found.");
  }
  if (
    !feature ||
    feature.workspaceId !== input.workspaceId ||
    feature.archivedAt
  ) {
    throw new Error("Feature not found.");
  }

  const existing = await db.pageFeature.findUnique({
    where: {
      pageId_featureId_role: {
        pageId: input.pageId,
        featureId: input.featureId,
        role: input.role,
      },
    },
    select: { id: true, status: true },
  });
  if (existing && existing.status === SuggestionStatus.CONFIRMED) {
    throw new Error("This PRD is already connected with that role.");
  }

  const [row] = await db.$transaction([
    existing
      ? db.pageFeature.update({
          where: { id: existing.id },
          data: {
            status: SuggestionStatus.CONFIRMED,
            origin: AgentOrigin.MANUAL,
          },
          select: pageFeatureItemSelect,
        })
      : db.pageFeature.create({
          data: {
            pageId: input.pageId,
            featureId: input.featureId,
            role: input.role,
            status: SuggestionStatus.CONFIRMED,
            origin: AgentOrigin.MANUAL,
          },
          select: pageFeatureItemSelect,
        }),
    db.feature.updateMany({
      where: {
        id: input.featureId,
        status: FeatureStatus.SUGGESTED,
        archivedAt: null,
      },
      data: { status: FeatureStatus.ACTIVE },
    }),
  ]);
  return toPageFeatureItem(row);
}

interface RemovePageFeatureInput {
  workspaceId: string;
  actorRole: Role;
  pageFeatureId: string;
}

/**
 * Detach a connection from the PRD side. Agent suggestions are REJECTED
 * (tombstoned against re-proposal); confirmed/manual rows are deleted.
 */
export async function removePageFeature(
  input: RemovePageFeatureInput,
): Promise<void> {
  requireRoleOnWorkspace(input.actorRole, Role.EDITOR);
  const row = await db.pageFeature.findUnique({
    where: { id: input.pageFeatureId },
    select: { status: true, feature: { select: { workspaceId: true } } },
  });
  if (!row || row.feature.workspaceId !== input.workspaceId) {
    throw new Error("Connection not found.");
  }
  if (row.status === SuggestionStatus.SUGGESTED) {
    await db.pageFeature.update({
      where: { id: input.pageFeatureId },
      data: { status: SuggestionStatus.REJECTED },
    });
  } else {
    await db.pageFeature.delete({ where: { id: input.pageFeatureId } });
  }
}

/** Accept every pending suggestion in one group; collisions are skipped. */
export async function bulkAcceptSuggestions(input: {
  workspaceId: string;
  actorRole: Role;
  group: "features" | "links" | "pageLinks";
}): Promise<{ accepted: number; failed: number }> {
  requireRoleOnWorkspace(input.actorRole, Role.EDITOR);
  const queue = await getSuggestionQueue(input.workspaceId);
  let accepted = 0;
  let failed = 0;

  if (input.group === "features") {
    for (const f of queue.features) {
      try {
        await resolveSuggestedFeature({
          workspaceId: input.workspaceId,
          actorRole: input.actorRole,
          featureId: f.id,
          action: "accept",
        });
        accepted++;
      } catch {
        failed++;
      }
    }
  } else if (input.group === "links") {
    for (const l of queue.links) {
      try {
        await resolveSuggestedLink({
          workspaceId: input.workspaceId,
          actorRole: input.actorRole,
          linkId: l.id,
          action: "accept",
        });
        accepted++;
      } catch {
        failed++;
      }
    }
  } else {
    for (const p of queue.pageLinks) {
      try {
        await resolveSuggestedPageLink({
          workspaceId: input.workspaceId,
          actorRole: input.actorRole,
          pageFeatureId: p.id,
          action: "accept",
        });
        accepted++;
      } catch {
        failed++;
      }
    }
  }
  return { accepted, failed };
}
