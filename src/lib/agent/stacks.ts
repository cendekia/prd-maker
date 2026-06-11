import "server-only";

import { Prisma, Role, StackType } from "@prisma/client";

import { ROLE_RANK } from "@/lib/config";
import { db } from "@/lib/db";
import { fractionalPosition } from "@/lib/pages";
import { type StackSummary } from "@/lib/agent/types";

/**
 * Stack service (ai_development_plan.md Step 45). Stacks are the deployable
 * surfaces of the workspace's application; every feature in the mind map
 * belongs to exactly one. All reads/writes scope by workspace; writes require
 * EDITOR+, delete requires OWNER (mirroring epics).
 */

/** Throws if `actorRole` is below `min`. Mirrors the helper in epics.ts. */
function requireRoleOnWorkspace(actorRole: Role, min: Role) {
  if (ROLE_RANK[actorRole] < ROLE_RANK[min]) {
    throw new Error(`Requires ${min}; have ${actorRole}.`);
  }
}

const stackSelect = {
  id: true,
  name: true,
  type: true,
  description: true,
  color: true,
  position: true,
} as const;

/**
 * Defaults seeded by "Set up default stacks" — the 1-workspace-=-1-application
 * starting shape. Fully editable afterwards.
 */
export const DEFAULT_STACK_SEEDS: {
  name: string;
  type: StackType;
  color: string;
  description: string;
}[] = [
  {
    name: "Frontend",
    type: StackType.FRONTEND,
    color: "#0EA5E9",
    description: "Web client UI",
  },
  {
    name: "Backend",
    type: StackType.BACKEND,
    color: "#10B981",
    description: "Core services and business logic",
  },
  {
    name: "API",
    type: StackType.API,
    color: "#5333D8",
    description: "Public and internal HTTP API surface",
  },
  {
    name: "WebSocket",
    type: StackType.WEBSOCKET,
    color: "#F59E0B",
    description: "Real-time channels and events",
  },
  {
    name: "Email UI",
    type: StackType.EMAIL,
    color: "#EC4899",
    description: "Transactional email templates",
  },
];

function isUniqueViolation(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
  );
}

// ───────────────────────────────────────────── Queries

/** All stacks for a workspace, position-ordered, with live feature counts. */
export async function listStacks(workspaceId: string): Promise<StackSummary[]> {
  const [stacks, counts] = await Promise.all([
    db.stack.findMany({
      where: { workspaceId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: stackSelect,
    }),
    db.feature.groupBy({
      by: ["stackId"],
      where: { workspaceId, archivedAt: null },
      _count: { _all: true },
    }),
  ]);
  const byStack = new Map(counts.map((c) => [c.stackId, c._count._all]));
  return stacks.map((s) => ({ ...s, featureCount: byStack.get(s.id) ?? 0 }));
}

async function featureCountFor(stackId: string): Promise<number> {
  return db.feature.count({ where: { stackId, archivedAt: null } });
}

// ───────────────────────────────────────────── Mutations

interface CreateStackInput {
  workspaceId: string;
  actorRole: Role;
  name: string;
  type?: StackType;
  description?: string | null;
  color?: string;
}

export async function createStack(
  input: CreateStackInput,
): Promise<StackSummary> {
  requireRoleOnWorkspace(input.actorRole, Role.EDITOR);
  const name = input.name.trim();
  if (!name || name.length > 60) {
    throw new Error("Stack name must be 1–60 characters.");
  }

  const last = await db.stack.findFirst({
    where: { workspaceId: input.workspaceId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  try {
    const stack = await db.stack.create({
      data: {
        workspaceId: input.workspaceId,
        name,
        type: input.type ?? StackType.OTHER,
        description: input.description?.trim() || null,
        color: input.color ?? undefined,
        position: (last?.position ?? 0) + 1,
      },
      select: stackSelect,
    });
    return { ...stack, featureCount: 0 };
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new Error(`A stack named “${name}” already exists.`);
    }
    throw e;
  }
}

interface UpdateStackInput {
  stackId: string;
  workspaceId: string;
  actorRole: Role;
  name?: string;
  type?: StackType;
  description?: string | null;
  color?: string;
}

export async function updateStack(
  input: UpdateStackInput,
): Promise<StackSummary> {
  requireRoleOnWorkspace(input.actorRole, Role.EDITOR);
  const stack = await db.stack.findUnique({
    where: { id: input.stackId },
    select: { workspaceId: true },
  });
  if (!stack || stack.workspaceId !== input.workspaceId) {
    throw new Error("Stack not found.");
  }

  const data: Prisma.StackUpdateInput = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name || name.length > 60) {
      throw new Error("Stack name must be 1–60 characters.");
    }
    data.name = name;
  }
  if (input.type !== undefined) data.type = input.type;
  if (input.description !== undefined) {
    data.description = input.description?.trim() || null;
  }
  if (input.color !== undefined) data.color = input.color;

  try {
    const updated = await db.stack.update({
      where: { id: input.stackId },
      data,
      select: stackSelect,
    });
    return { ...updated, featureCount: await featureCountFor(updated.id) };
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new Error("A stack with this name already exists.");
    }
    throw e;
  }
}

interface MoveStackInput {
  stackId: string;
  workspaceId: string;
  actorRole: Role;
  beforeId?: string | null;
  afterId?: string | null;
}

/** Drag-to-reorder: set a fractional position between two neighbors. */
export async function moveStack(input: MoveStackInput): Promise<StackSummary> {
  requireRoleOnWorkspace(input.actorRole, Role.EDITOR);
  const stack = await db.stack.findUnique({
    where: { id: input.stackId },
    select: { workspaceId: true },
  });
  if (!stack || stack.workspaceId !== input.workspaceId) {
    throw new Error("Stack not found.");
  }

  const [before, after] = await Promise.all([
    input.beforeId
      ? db.stack.findUnique({
          where: { id: input.beforeId },
          select: { position: true, workspaceId: true },
        })
      : null,
    input.afterId
      ? db.stack.findUnique({
          where: { id: input.afterId },
          select: { position: true, workspaceId: true },
        })
      : null,
  ]);
  if (before && before.workspaceId !== input.workspaceId) {
    throw new Error("beforeId is not in this workspace.");
  }
  if (after && after.workspaceId !== input.workspaceId) {
    throw new Error("afterId is not in this workspace.");
  }

  let position: number;
  if (before || after) {
    position = fractionalPosition(
      before?.position ?? null,
      after?.position ?? null,
    );
  } else {
    const last = await db.stack.findFirst({
      where: { workspaceId: input.workspaceId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    position = (last?.position ?? 0) + 1;
  }

  const updated = await db.stack.update({
    where: { id: input.stackId },
    data: { position },
    select: stackSelect,
  });
  return { ...updated, featureCount: await featureCountFor(updated.id) };
}

interface DeleteStackInput {
  stackId: string;
  workspaceId: string;
  actorRole: Role;
}

/**
 * Delete a stack. Blocked while any feature (archived included — the FK
 * counts all rows) still references it; the DB's NO ACTION constraint
 * backstops this check.
 */
export async function deleteStack(input: DeleteStackInput): Promise<void> {
  requireRoleOnWorkspace(input.actorRole, Role.OWNER);
  const stack = await db.stack.findUnique({
    where: { id: input.stackId },
    select: { workspaceId: true, name: true },
  });
  if (!stack || stack.workspaceId !== input.workspaceId) {
    throw new Error("Stack not found.");
  }

  const features = await db.feature.count({
    where: { stackId: input.stackId },
  });
  if (features > 0) {
    throw new Error(
      `“${stack.name}” still has ${features} feature${features === 1 ? "" : "s"}. Reassign or delete them first.`,
    );
  }
  await db.stack.delete({ where: { id: input.stackId } });
}

interface SeedStacksInput {
  workspaceId: string;
  actorRole: Role;
}

/** One-click empty-state setup. Refuses to run once any stack exists. */
export async function seedDefaultStacks(
  input: SeedStacksInput,
): Promise<StackSummary[]> {
  requireRoleOnWorkspace(input.actorRole, Role.EDITOR);
  const existing = await db.stack.count({
    where: { workspaceId: input.workspaceId },
  });
  if (existing > 0) {
    throw new Error("This workspace already has stacks set up.");
  }
  await db.stack.createMany({
    data: DEFAULT_STACK_SEEDS.map((seed, i) => ({
      workspaceId: input.workspaceId,
      name: seed.name,
      type: seed.type,
      description: seed.description,
      color: seed.color,
      position: i + 1,
    })),
    skipDuplicates: true,
  });
  return listStacks(input.workspaceId);
}
