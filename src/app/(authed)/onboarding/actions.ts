"use server";

import { redirect } from "next/navigation";
import { Role } from "@prisma/client";

import { db } from "@/lib/db";
import { isValidSlug } from "@/lib/slug";
import { requireUser } from "@/lib/workspace";

interface CreateWorkspaceInput {
  name: string;
  slug: string;
}

export interface CreateWorkspaceResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<"name" | "slug", string>>;
}

export async function createWorkspaceAction(
  input: CreateWorkspaceInput,
): Promise<CreateWorkspaceResult> {
  const user = await requireUser();

  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();

  const fieldErrors: Record<string, string> = {};
  if (name.length < 2 || name.length > 60) {
    fieldErrors.name = "Name must be between 2 and 60 characters.";
  }
  if (!isValidSlug(slug)) {
    fieldErrors.slug =
      "Slug must be 1–40 chars, lowercase letters/digits/hyphens, and not reserved.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  const existing = await db.workspace.findUnique({ where: { slug } });
  if (existing) {
    return { ok: false, fieldErrors: { slug: "That slug is already taken." } };
  }

  await db.workspace.create({
    data: {
      name,
      slug,
      members: {
        create: { userId: user.id, role: Role.OWNER },
      },
    },
  });

  redirect(`/${slug}`);
}

export async function acceptInviteFromOnboardingAction(
  inviteToken: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const invite = await db.workspaceInvite.findUnique({
    where: { token: inviteToken },
    include: { workspace: { select: { slug: true } } },
  });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    return { ok: false, error: "This invite is no longer valid." };
  }
  if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
    return { ok: false, error: "This invite was sent to a different email." };
  }

  await db.$transaction([
    db.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: invite.workspaceId,
          userId: user.id,
        },
      },
      create: {
        workspaceId: invite.workspaceId,
        userId: user.id,
        role: invite.role,
      },
      update: {},
    }),
    db.workspaceInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    }),
  ]);

  redirect(`/${invite.workspace.slug}`);
}

