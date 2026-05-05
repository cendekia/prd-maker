import "server-only";

import { Role } from "@prisma/client";

import { db } from "@/lib/db";
import { ROLE_RANK } from "@/lib/config";

export interface PageAccess {
  pageId: string;
  workspaceId: string;
  /** Effective role after combining workspace membership + per-page ACL. */
  role: Role;
}

/**
 * Resolve the user's effective role on a page, or null if not allowed.
 *
 * Today: workspace membership only. Step 26 layers per-page ACLs on top
 * (Business tier) — when a `PagePermission` row exists for (page, user),
 * it overrides the workspace role.
 */
export async function getPageAccess(
  pageId: string,
  userId: string,
): Promise<PageAccess | null> {
  const page = await db.page.findUnique({
    where: { id: pageId },
    select: {
      id: true,
      workspaceId: true,
      archivedAt: true,
    },
  });
  if (!page) return null;
  if (page.archivedAt) return null;

  const member = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: page.workspaceId, userId } },
    select: { role: true },
  });
  if (!member) return null;

  const acl = await db.pagePermission.findUnique({
    where: { pageId_userId: { pageId, userId } },
    select: { role: true },
  });

  const role = acl?.role ?? member.role;
  return { pageId: page.id, workspaceId: page.workspaceId, role };
}

/** Throws if the user can't read this page. Returns the effective access on success. */
export async function requirePageAccess(
  pageId: string,
  userId: string,
  minimum: Role = Role.VIEWER,
): Promise<PageAccess> {
  const access = await getPageAccess(pageId, userId);
  if (!access) {
    throw new Error("PageNotFoundOrForbidden");
  }
  if (ROLE_RANK[access.role] < ROLE_RANK[minimum]) {
    throw new Error(`Requires ${minimum} on this page; have ${access.role}.`);
  }
  return access;
}
