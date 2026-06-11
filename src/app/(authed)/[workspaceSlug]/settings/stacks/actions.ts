"use server";

import { revalidatePath } from "next/cache";
import { StackType } from "@prisma/client";

import {
  createStack,
  deleteStack,
  moveStack,
  seedDefaultStacks,
  updateStack,
} from "@/lib/agent/stacks";
import { requireWorkspace } from "@/lib/workspace";

interface ActionResult {
  ok: boolean;
  error?: string;
}

export interface StackFormInput {
  name: string;
  type: string;
  description: string;
  color: string;
}

function parseType(v: string): StackType | undefined {
  return (Object.values(StackType) as string[]).includes(v)
    ? (v as StackType)
    : undefined;
}

function parseColor(v: string): string | undefined {
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : undefined;
}

export async function seedDefaultStacksAction(
  workspaceSlug: string,
): Promise<ActionResult> {
  // requireWorkspace redirects on auth failure — keep it outside the try so
  // the NEXT_REDIRECT control-flow error isn't swallowed as an ActionResult.
  const { workspace, member } = await requireWorkspace(workspaceSlug);
  try {
    await seedDefaultStacks({
      workspaceId: workspace.id,
      actorRole: member.role,
    });
    revalidatePath(`/${workspace.slug}/settings/stacks`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function createStackAction(
  workspaceSlug: string,
  input: StackFormInput,
): Promise<ActionResult> {
  const { workspace, member } = await requireWorkspace(workspaceSlug);
  try {
    await createStack({
      workspaceId: workspace.id,
      actorRole: member.role,
      name: input.name,
      type: parseType(input.type),
      description: input.description,
      color: parseColor(input.color),
    });
    revalidatePath(`/${workspace.slug}/settings/stacks`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function updateStackAction(
  workspaceSlug: string,
  stackId: string,
  input: StackFormInput,
): Promise<ActionResult> {
  const { workspace, member } = await requireWorkspace(workspaceSlug);
  try {
    await updateStack({
      stackId,
      workspaceId: workspace.id,
      actorRole: member.role,
      name: input.name,
      type: parseType(input.type),
      description: input.description,
      color: parseColor(input.color),
    });
    revalidatePath(`/${workspace.slug}/settings/stacks`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function moveStackAction(
  workspaceSlug: string,
  stackId: string,
  beforeId: string | null,
  afterId: string | null,
): Promise<ActionResult> {
  const { workspace, member } = await requireWorkspace(workspaceSlug);
  try {
    await moveStack({
      stackId,
      workspaceId: workspace.id,
      actorRole: member.role,
      beforeId,
      afterId,
    });
    revalidatePath(`/${workspace.slug}/settings/stacks`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deleteStackAction(
  workspaceSlug: string,
  stackId: string,
): Promise<ActionResult> {
  const { workspace, member } = await requireWorkspace(workspaceSlug);
  try {
    await deleteStack({
      stackId,
      workspaceId: workspace.id,
      actorRole: member.role,
    });
    revalidatePath(`/${workspace.slug}/settings/stacks`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
