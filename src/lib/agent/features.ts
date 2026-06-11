import "server-only";

import {
  AgentOrigin,
  FeatureLinkKind,
  FeatureStatus,
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
