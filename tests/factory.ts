import { randomUUID } from "node:crypto";

import {
  AgentOrigin,
  FeatureLinkKind,
  FeatureStatus,
  PageFeatureRole,
  Role,
  StackType,
  SuggestionStatus,
} from "@prisma/client";

import { db } from "@/lib/db";

/**
 * Test data factory (Step 54). Every created workspace/user is registered so
 * `cleanupAll()` (call it in afterAll) can delete them — workspace deletion
 * cascades to stacks, features, links, pages, joins, jobs, impact runs, and
 * agent threads, so a single delete cleans almost everything.
 */

const createdWorkspaces: string[] = [];
const createdUsers: string[] = [];

export function uid(prefix = "t"): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

export async function createUser(over?: { email?: string; name?: string }) {
  const user = await db.user.create({
    data: {
      email: over?.email ?? `${uid("u")}@test.local`,
      name: over?.name ?? "Test User",
    },
  });
  createdUsers.push(user.id);
  return user;
}

export async function createWorkspace(over?: { name?: string; slug?: string }) {
  const ws = await db.workspace.create({
    data: { name: over?.name ?? "Test WS", slug: over?.slug ?? uid("ws") },
  });
  createdWorkspaces.push(ws.id);
  return ws;
}

export async function addMember(
  workspaceId: string,
  userId: string,
  role: Role = Role.OWNER,
) {
  return db.workspaceMember.create({ data: { workspaceId, userId, role } });
}

/** Workspace + owner member + user in one call. */
export async function createWorkspaceWithOwner() {
  const user = await createUser();
  const workspace = await createWorkspace();
  await addMember(workspace.id, user.id, Role.OWNER);
  return { workspace, user };
}

export async function createStack(
  workspaceId: string,
  over?: { name?: string; type?: StackType },
) {
  return db.stack.create({
    data: {
      workspaceId,
      name: over?.name ?? uid("stack"),
      type: over?.type ?? StackType.OTHER,
    },
  });
}

export async function createFeature(
  workspaceId: string,
  stackId: string,
  over?: {
    name?: string;
    summary?: string;
    status?: FeatureStatus;
    origin?: AgentOrigin;
    archivedAt?: Date | null;
  },
) {
  return db.feature.create({
    data: {
      workspaceId,
      stackId,
      name: over?.name ?? uid("feat"),
      summary: over?.summary ?? "A test feature.",
      status: over?.status ?? FeatureStatus.ACTIVE,
      origin: over?.origin ?? AgentOrigin.MANUAL,
      archivedAt: over?.archivedAt ?? null,
    },
  });
}

export async function createLink(
  workspaceId: string,
  fromFeatureId: string,
  toFeatureId: string,
  kind: FeatureLinkKind = FeatureLinkKind.CONSUMES,
  over?: { status?: SuggestionStatus; origin?: AgentOrigin },
) {
  return db.featureLink.create({
    data: {
      workspaceId,
      fromFeatureId,
      toFeatureId,
      kind,
      status: over?.status ?? SuggestionStatus.CONFIRMED,
      origin: over?.origin ?? AgentOrigin.MANUAL,
    },
  });
}

export async function createPage(
  workspaceId: string,
  createdById: string,
  over?: { title?: string; contentText?: string; archivedAt?: Date | null },
) {
  return db.page.create({
    data: {
      workspaceId,
      createdById,
      title: over?.title ?? "Test PRD",
      contentText: over?.contentText ?? "",
      archivedAt: over?.archivedAt ?? null,
    },
  });
}

export async function createPageFeature(
  pageId: string,
  featureId: string,
  role: PageFeatureRole = PageFeatureRole.DEFINES,
  over?: { status?: SuggestionStatus; origin?: AgentOrigin },
) {
  return db.pageFeature.create({
    data: {
      pageId,
      featureId,
      role,
      status: over?.status ?? SuggestionStatus.CONFIRMED,
      origin: over?.origin ?? AgentOrigin.MANUAL,
    },
  });
}

/** Delete everything this test file created. Call in afterAll. */
export async function cleanupAll() {
  if (createdWorkspaces.length > 0) {
    await db.workspace.deleteMany({ where: { id: { in: createdWorkspaces } } });
    createdWorkspaces.length = 0;
  }
  if (createdUsers.length > 0) {
    await db.user.deleteMany({ where: { id: { in: createdUsers } } });
    createdUsers.length = 0;
  }
}

export { db };
