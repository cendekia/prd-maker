import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { Role } from "@prisma/client";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { ROLE_RANK } from "@/lib/config";

export { isValidSlug, slugify, RESERVED_SLUGS } from "@/lib/slug";

/** Returns the current session, or null. */
export const getSession = cache(async () => {
  return auth();
});

/** Ensures the request is authenticated; redirects to /sign-in otherwise. */
export async function requireUser() {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/sign-in");
  }
  return session.user as { id: string; email: string; name?: string | null; image?: string | null };
}

interface WorkspaceWithMembership {
  workspace: { id: string; name: string; slug: string };
  member: { id: string; role: Role };
}

/**
 * Resolves the workspace by slug and verifies the current user is a member.
 * Redirects to /onboarding if the user isn't signed in or isn't a member.
 */
export async function requireWorkspace(
  slug: string,
): Promise<WorkspaceWithMembership> {
  const user = await requireUser();
  const workspace = await db.workspace.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true },
  });
  if (!workspace) {
    redirect("/onboarding");
  }
  const member = await db.workspaceMember.findUnique({
    where: {
      workspaceId_userId: { workspaceId: workspace.id, userId: user.id },
    },
    select: { id: true, role: true },
  });
  if (!member) {
    redirect("/onboarding");
  }
  return { workspace, member };
}

/** Throws if the member's role is below `minimum`. */
export function requireRole(role: Role, minimum: Role) {
  if (ROLE_RANK[role] < ROLE_RANK[minimum]) {
    throw new Error(`Requires ${minimum} role; have ${role}.`);
  }
}

/** All workspaces the current user is a member of, ordered by recency of membership. */
export async function listUserWorkspaces(userId: string) {
  const memberships = await db.workspaceMember.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: {
      workspace: {
        select: { id: true, name: true, slug: true },
      },
    },
  });
  return memberships.map((m) => ({
    workspace: m.workspace,
    role: m.role,
  }));
}

/** Pending invites for the user's email address (not yet accepted, not expired). */
export async function listPendingInvitesForEmail(email: string) {
  return db.workspaceInvite.findMany({
    where: {
      email: email.toLowerCase(),
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: {
      workspace: { select: { name: true, slug: true } },
      createdBy: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}
