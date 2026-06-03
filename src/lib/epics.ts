import "server-only";

import { AgileStatus, EpicStatus, Prisma, Role } from "@prisma/client";

import { db } from "@/lib/db";
import { ROLE_RANK } from "@/lib/config";
import { fractionalPosition } from "@/lib/pages";
import { DEFAULT_EPIC_COLOR, type EpicCore, type EpicSummary } from "@/lib/agile";

/** Throws if `actorRole` is below `min`. Mirrors the helper in pages.ts. */
function requireRoleOnWorkspace(actorRole: Role, min: Role) {
  if (ROLE_RANK[actorRole] < ROLE_RANK[min]) {
    throw new Error(`Requires ${min}; have ${actorRole}.`);
  }
}

/** Core epic fields returned to the client (counts are added separately). */
const epicCoreSelect = {
  id: true,
  key: true,
  name: true,
  description: true,
  color: true,
  status: true,
  position: true,
} as const;

// ───────────────────────────────────────────── Board query

/**
 * All non-archived epics for a workspace, board-ordered, each with its
 * assigned-PRD count and how many of those are DONE (for the progress meter).
 */
export async function listEpicsWithRollups(
  workspaceId: string,
): Promise<EpicSummary[]> {
  const [epics, groups] = await Promise.all([
    db.epic.findMany({
      where: { workspaceId, archivedAt: null },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: epicCoreSelect,
    }),
    db.page.groupBy({
      by: ["epicId", "agileStatus"],
      where: { workspaceId, archivedAt: null, epicId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const total = new Map<string, number>();
  const done = new Map<string, number>();
  for (const g of groups) {
    if (!g.epicId) continue;
    const count = g._count._all;
    total.set(g.epicId, (total.get(g.epicId) ?? 0) + count);
    if (g.agileStatus === AgileStatus.DONE) {
      done.set(g.epicId, (done.get(g.epicId) ?? 0) + count);
    }
  }

  return epics.map((e) => ({
    ...e,
    pageCount: total.get(e.id) ?? 0,
    doneCount: done.get(e.id) ?? 0,
  }));
}

/** Epic + its assigned PRDs, for the detail panel. Null if not in workspace. */
export async function getEpicWithPages(epicId: string, workspaceId: string) {
  const epic = await db.epic.findUnique({
    where: { id: epicId },
    select: {
      id: true,
      key: true,
      name: true,
      description: true,
      color: true,
      status: true,
      workspaceId: true,
    },
  });
  if (!epic || epic.workspaceId !== workspaceId) return null;

  const pages = await db.page.findMany({
    where: { workspaceId, epicId, archivedAt: null },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, agileStatus: true },
  });

  const { workspaceId: _ws, ...rest } = epic;
  void _ws;
  return { epic: rest, pages };
}

// ───────────────────────────────────────────── Mutations

interface CreateEpicInput {
  workspaceId: string;
  actorId: string;
  actorRole: Role;
  name?: string;
  description?: string | null;
  color?: string;
  status?: EpicStatus;
}

export async function createEpic(input: CreateEpicInput): Promise<EpicCore> {
  requireRoleOnWorkspace(input.actorRole, Role.EDITOR);
  const status = input.status ?? EpicStatus.PLANNED;

  return db.$transaction(async (tx) => {
    // Generate `EPIC-<n>` from the highest existing suffix so deletes don't
    // cause key collisions against the @@unique([workspaceId, key]) constraint.
    const existing = await tx.epic.findMany({
      where: { workspaceId: input.workspaceId },
      select: { key: true },
    });
    let max = 0;
    for (const e of existing) {
      const m = /^EPIC-(\d+)$/.exec(e.key);
      if (m) max = Math.max(max, Number.parseInt(m[1], 10));
    }
    const last = await tx.epic.findFirst({
      where: { workspaceId: input.workspaceId, status },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    return tx.epic.create({
      data: {
        workspaceId: input.workspaceId,
        key: `EPIC-${max + 1}`,
        name: input.name?.trim() || "Untitled epic",
        description: input.description?.trim() || null,
        color: input.color || DEFAULT_EPIC_COLOR,
        status,
        position: (last?.position ?? 0) + 1,
        createdById: input.actorId,
      },
      select: epicCoreSelect,
    });
  });
}

interface UpdateEpicInput {
  epicId: string;
  workspaceId: string;
  actorRole: Role;
  name?: string;
  description?: string | null;
  color?: string;
  status?: EpicStatus;
  archived?: boolean;
}

export async function updateEpic(input: UpdateEpicInput): Promise<EpicCore> {
  requireRoleOnWorkspace(input.actorRole, Role.EDITOR);
  const epic = await db.epic.findUnique({
    where: { id: input.epicId },
    select: { workspaceId: true, status: true },
  });
  if (!epic || epic.workspaceId !== input.workspaceId) {
    throw new Error("Epic not found.");
  }

  const data: Prisma.EpicUpdateInput = {};
  if (input.name !== undefined) data.name = input.name.trim() || "Untitled epic";
  if (input.description !== undefined) {
    data.description = input.description?.trim() || null;
  }
  if (input.color !== undefined) data.color = input.color;
  if (input.archived !== undefined) {
    data.archivedAt = input.archived ? new Date() : null;
  }
  // Changing status from the dialog appends the epic to the end of its column.
  if (input.status !== undefined && input.status !== epic.status) {
    const last = await db.epic.findFirst({
      where: { workspaceId: input.workspaceId, status: input.status },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    data.status = input.status;
    data.position = (last?.position ?? 0) + 1;
  }

  return db.epic.update({
    where: { id: input.epicId },
    data,
    select: epicCoreSelect,
  });
}

interface MoveEpicInput {
  epicId: string;
  workspaceId: string;
  actorRole: Role;
  status: EpicStatus;
  beforeId?: string | null;
  afterId?: string | null;
}

/** Drag-and-drop: set the epic's column (status) and fractional position. */
export async function moveEpic(input: MoveEpicInput): Promise<EpicCore> {
  requireRoleOnWorkspace(input.actorRole, Role.EDITOR);
  const epic = await db.epic.findUnique({
    where: { id: input.epicId },
    select: { workspaceId: true },
  });
  if (!epic || epic.workspaceId !== input.workspaceId) {
    throw new Error("Epic not found.");
  }

  const [before, after] = await Promise.all([
    input.beforeId
      ? db.epic.findUnique({
          where: { id: input.beforeId },
          select: { position: true, status: true, workspaceId: true },
        })
      : null,
    input.afterId
      ? db.epic.findUnique({
          where: { id: input.afterId },
          select: { position: true, status: true, workspaceId: true },
        })
      : null,
  ]);
  if (
    before &&
    (before.workspaceId !== input.workspaceId || before.status !== input.status)
  ) {
    throw new Error("beforeId is not in the target column.");
  }
  if (
    after &&
    (after.workspaceId !== input.workspaceId || after.status !== input.status)
  ) {
    throw new Error("afterId is not in the target column.");
  }

  let position: number;
  if (before || after) {
    position = fractionalPosition(before?.position ?? null, after?.position ?? null);
  } else {
    const last = await db.epic.findFirst({
      where: { workspaceId: input.workspaceId, status: input.status },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    position = (last?.position ?? 0) + 1;
  }

  return db.epic.update({
    where: { id: input.epicId },
    data: { status: input.status, position },
    select: epicCoreSelect,
  });
}

interface DeleteEpicInput {
  epicId: string;
  workspaceId: string;
  actorRole: Role;
}

export async function deleteEpic(input: DeleteEpicInput): Promise<void> {
  requireRoleOnWorkspace(input.actorRole, Role.OWNER);
  const epic = await db.epic.findUnique({
    where: { id: input.epicId },
    select: { workspaceId: true },
  });
  if (!epic || epic.workspaceId !== input.workspaceId) {
    throw new Error("Epic not found.");
  }
  // Pages keep existing; their epicId is set null by the FK's onDelete: SetNull.
  await db.epic.delete({ where: { id: input.epicId } });
}
