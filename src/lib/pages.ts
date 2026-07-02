import "server-only";

import { Role } from "@prisma/client";

import { db } from "@/lib/db";
import { ROLE_RANK } from "@/lib/config";
import type { PageTreeNode } from "@/lib/types";

const ARCHIVE_RETENTION_DAYS = 30;

/** Throws if `actorRole` is below `min`. */
function requireRoleOnWorkspace(actorRole: Role, min: Role) {
  if (ROLE_RANK[actorRole] < ROLE_RANK[min]) {
    throw new Error(`Requires ${min}; have ${actorRole}.`);
  }
}

// ───────────────────────────────────────────── Tree

/**
 * Returns the workspace's non-archived pages as a tree.
 * Children are ordered by `position` ascending; ties broken by `createdAt`.
 */
export async function getPageTree(workspaceId: string): Promise<PageTreeNode[]> {
  const pages = await db.page.findMany({
    where: { workspaceId, archivedAt: null },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      parentId: true,
      title: true,
      position: true,
      isPublished: true,
      archivedAt: true,
    },
  });

  type Bare = (typeof pages)[number];
  const byParent = new Map<string | null, Bare[]>();
  for (const p of pages) {
    const arr = byParent.get(p.parentId) ?? [];
    arr.push(p);
    byParent.set(p.parentId, arr);
  }

  function build(parentId: string | null): PageTreeNode[] {
    const kids = byParent.get(parentId) ?? [];
    return kids.map((p) => {
      const children = build(p.id);
      return {
        id: p.id,
        parentId: p.parentId,
        title: p.title,
        position: p.position,
        isPublished: p.isPublished,
        archivedAt: p.archivedAt ? p.archivedAt.toISOString() : null,
        hasChildren: children.length > 0,
        children,
      };
    });
  }

  return build(null);
}

// ───────────────────────────────────────────── Position math

/**
 * Compute a fractional position between two siblings.
 * If both are null, returns 1.0. Re-balancing happens lazily — when the gap
 * gets very small, callers should re-spread sibling positions on a 1.0 step.
 */
export function fractionalPosition(
  before: number | null,
  after: number | null,
): number {
  if (before == null && after == null) return 1;
  if (before == null) return after! - 1;
  if (after == null) return before + 1;
  return (before + after) / 2;
}

async function nextEndPosition(
  workspaceId: string,
  parentId: string | null,
): Promise<number> {
  const last = await db.page.findFirst({
    where: { workspaceId, parentId, archivedAt: null },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return (last?.position ?? 0) + 1;
}

// ───────────────────────────────────────────── CRUD

interface CreatePageInput {
  workspaceId: string;
  actorId: string;
  actorRole: Role;
  parentId?: string | null;
  title?: string;
  templateId?: string | null;
}

export async function createPage(input: CreatePageInput) {
  requireRoleOnWorkspace(input.actorRole, Role.EDITOR);

  if (input.parentId) {
    const parent = await db.page.findUnique({
      where: { id: input.parentId },
      select: { workspaceId: true, archivedAt: true },
    });
    if (!parent || parent.workspaceId !== input.workspaceId || parent.archivedAt) {
      throw new Error("Parent page not found.");
    }
  }

  let contentJson = null as unknown;
  let templateMissing = false;
  let resolvedTemplateId: string | null = null;
  if (input.templateId) {
    const template = await db.template.findUnique({
      where: { id: input.templateId },
      select: { workspaceId: true, contentJson: true },
    });
    if (!template) {
      // The picked template vanished between the picker listing and the click
      // (deleted by an owner, or a stale client). Degrade to a blank page and
      // let the caller surface a notice instead of failing the creation.
      templateMissing = true;
    } else if (
      template.workspaceId !== null &&
      template.workspaceId !== input.workspaceId
    ) {
      // Another workspace's template id — tenancy is never a fallback case.
      throw new Error("Template not found.");
    } else {
      contentJson = template.contentJson;
      // Remember the source template — it's the page's completeness-checklist
      // target (Step 57).
      resolvedTemplateId = input.templateId;
    }
  }

  const position = await nextEndPosition(input.workspaceId, input.parentId ?? null);

  const page = await db.page.create({
    data: {
      workspaceId: input.workspaceId,
      parentId: input.parentId ?? null,
      title: input.title?.trim() || "Untitled",
      position,
      contentJson: contentJson as never,
      templateId: resolvedTemplateId,
      createdById: input.actorId,
    },
    select: { id: true, title: true, parentId: true, position: true, workspaceId: true },
  });

  return { page, templateMissing };
}

interface RenamePageInput {
  pageId: string;
  actorId: string;
  actorRole: Role;
  title: string;
}

export async function renamePage(input: RenamePageInput) {
  requireRoleOnWorkspace(input.actorRole, Role.EDITOR);
  const title = input.title.trim().slice(0, 200) || "Untitled";
  return db.page.update({
    where: { id: input.pageId },
    data: { title },
    select: { id: true, title: true },
  });
}

interface ArchivePageInput {
  pageId: string;
  actorId: string;
  actorRole: Role;
}

/**
 * Soft-delete: sets `archivedAt`. The page disappears from the tree.
 * A scheduled job (Step 29's cron) hard-deletes archives older than 30 days.
 */
export async function archivePage(input: ArchivePageInput) {
  requireRoleOnWorkspace(input.actorRole, Role.EDITOR);
  return db.page.update({
    where: { id: input.pageId },
    data: { archivedAt: new Date() },
    select: { id: true },
  });
}

export async function restorePage(input: ArchivePageInput) {
  requireRoleOnWorkspace(input.actorRole, Role.EDITOR);
  return db.page.update({
    where: { id: input.pageId },
    data: { archivedAt: null },
    select: { id: true },
  });
}

interface DeletePageInput {
  pageId: string;
  actorId: string;
  actorRole: Role;
  /** Skip the 30-day archive window — owners can force-delete. */
  force?: boolean;
}

export async function deletePage(input: DeletePageInput) {
  if (!input.force) {
    requireRoleOnWorkspace(input.actorRole, Role.EDITOR);
  } else {
    requireRoleOnWorkspace(input.actorRole, Role.OWNER);
  }
  const page = await db.page.findUnique({
    where: { id: input.pageId },
    select: { archivedAt: true },
  });
  if (!page) throw new Error("Page not found.");
  if (!input.force) {
    if (!page.archivedAt) {
      throw new Error("Archive the page before permanent delete.");
    }
    const ageMs = Date.now() - page.archivedAt.getTime();
    const cutoff = ARCHIVE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    if (ageMs < cutoff) {
      throw new Error("Archived page must wait 30 days before permanent delete.");
    }
  }
  await db.page.delete({ where: { id: input.pageId } });
}

interface MovePageInput {
  pageId: string;
  actorId: string;
  actorRole: Role;
  newParentId: string | null;
  /** Sibling whose position should be just above the moved page. */
  beforeId?: string | null;
  /** Sibling whose position should be just below the moved page. */
  afterId?: string | null;
}

export async function movePage(input: MovePageInput) {
  requireRoleOnWorkspace(input.actorRole, Role.EDITOR);

  const page = await db.page.findUnique({
    where: { id: input.pageId },
    select: { id: true, workspaceId: true },
  });
  if (!page) throw new Error("Page not found.");

  if (input.newParentId) {
    if (input.newParentId === input.pageId) {
      throw new Error("Cannot reparent a page under itself.");
    }
    // Disallow cycles: reject if newParent is a descendant of pageId.
    if (await isDescendant(input.pageId, input.newParentId)) {
      throw new Error("Cannot reparent a page under its own descendant.");
    }
    const parent = await db.page.findUnique({
      where: { id: input.newParentId },
      select: { workspaceId: true, archivedAt: true },
    });
    if (
      !parent ||
      parent.workspaceId !== page.workspaceId ||
      parent.archivedAt
    ) {
      throw new Error("Target parent not found.");
    }
  }

  const [before, after] = await Promise.all([
    input.beforeId
      ? db.page.findUnique({
          where: { id: input.beforeId },
          select: { position: true, parentId: true },
        })
      : null,
    input.afterId
      ? db.page.findUnique({
          where: { id: input.afterId },
          select: { position: true, parentId: true },
        })
      : null,
  ]);

  // Validate sibling parents match the new parent (if specified).
  if (before && before.parentId !== (input.newParentId ?? null)) {
    throw new Error("beforeId is not a sibling under the new parent.");
  }
  if (after && after.parentId !== (input.newParentId ?? null)) {
    throw new Error("afterId is not a sibling under the new parent.");
  }

  let position: number;
  if (before || after) {
    position = fractionalPosition(
      before?.position ?? null,
      after?.position ?? null,
    );
  } else {
    position = await nextEndPosition(page.workspaceId, input.newParentId ?? null);
  }

  return db.page.update({
    where: { id: input.pageId },
    data: { parentId: input.newParentId ?? null, position },
    select: { id: true, parentId: true, position: true },
  });
}

/** True if `candidateAncestorId` is a descendant of `pageId`. */
async function isDescendant(
  pageId: string,
  candidateAncestorId: string,
): Promise<boolean> {
  let cursor: string | null = candidateAncestorId;
  // Walk up — if we hit pageId, candidate is in pageId's subtree.
  for (let i = 0; i < 64 && cursor; i++) {
    const row: { parentId: string | null } | null = await db.page.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });
    if (!row) return false;
    if (row.parentId === pageId) return true;
    cursor = row.parentId;
  }
  return false;
}
