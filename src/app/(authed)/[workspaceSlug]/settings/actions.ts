"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";

import { db } from "@/lib/db";
import { sendWorkspaceInviteEmail } from "@/lib/email";
import { isValidSlug } from "@/lib/slug";
import { APP_URL } from "@/lib/config";
import { requireUser, requireWorkspace } from "@/lib/workspace";

interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

const INVITE_TTL_DAYS = 7;

// ───────────────────────────────────────────────── General

export async function renameWorkspaceAction(
  workspaceSlug: string,
  name: string,
): Promise<ActionResult> {
  const { workspace, member } = await requireWorkspace(workspaceSlug);
  if (member.role !== Role.OWNER) {
    return { ok: false, error: "Only owners can rename the workspace." };
  }
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 60) {
    return { ok: false, fieldErrors: { name: "Name must be 2–60 characters." } };
  }
  await db.workspace.update({ where: { id: workspace.id }, data: { name: trimmed } });
  revalidatePath(`/${workspace.slug}/settings`);
  return { ok: true };
}

export async function changeSlugAction(
  workspaceSlug: string,
  newSlug: string,
): Promise<ActionResult> {
  const { workspace, member } = await requireWorkspace(workspaceSlug);
  if (member.role !== Role.OWNER) {
    return { ok: false, error: "Only owners can change the slug." };
  }
  const slug = newSlug.trim().toLowerCase();
  if (!isValidSlug(slug)) {
    return {
      ok: false,
      fieldErrors: {
        slug: "Slug must be 1–40 chars, lowercase letters/digits/hyphens, and not reserved.",
      },
    };
  }
  if (slug === workspace.slug) return { ok: true };
  const existing = await db.workspace.findUnique({ where: { slug } });
  if (existing) {
    return { ok: false, fieldErrors: { slug: "That slug is already taken." } };
  }
  await db.workspace.update({ where: { id: workspace.id }, data: { slug } });
  redirect(`/${slug}/settings`);
}

export async function deleteWorkspaceAction(
  workspaceSlug: string,
  confirmName: string,
): Promise<ActionResult> {
  const { workspace, member } = await requireWorkspace(workspaceSlug);
  if (member.role !== Role.OWNER) {
    return { ok: false, error: "Only owners can delete the workspace." };
  }
  if (confirmName.trim() !== workspace.name) {
    return { ok: false, fieldErrors: { confirm: "Confirmation does not match the workspace name." } };
  }
  await db.workspace.delete({ where: { id: workspace.id } });
  redirect("/onboarding");
}

// ───────────────────────────────────────────────── Members

export async function changeMemberRoleAction(
  workspaceSlug: string,
  memberId: string,
  newRole: Role,
): Promise<ActionResult> {
  const { workspace, member: actor } = await requireWorkspace(workspaceSlug);
  if (actor.role !== Role.OWNER) {
    return { ok: false, error: "Only owners can change member roles." };
  }
  const target = await db.workspaceMember.findUnique({ where: { id: memberId } });
  if (!target || target.workspaceId !== workspace.id) {
    return { ok: false, error: "Member not found." };
  }
  if (target.role === Role.OWNER && newRole !== Role.OWNER) {
    const ownerCount = await db.workspaceMember.count({
      where: { workspaceId: workspace.id, role: Role.OWNER },
    });
    if (ownerCount <= 1) {
      return { ok: false, error: "Cannot demote the last owner." };
    }
  }
  await db.workspaceMember.update({ where: { id: memberId }, data: { role: newRole } });
  revalidatePath(`/${workspace.slug}/settings/members`);
  return { ok: true };
}

export async function removeMemberAction(
  workspaceSlug: string,
  memberId: string,
): Promise<ActionResult> {
  const { workspace, member: actor } = await requireWorkspace(workspaceSlug);
  const target = await db.workspaceMember.findUnique({ where: { id: memberId } });
  if (!target || target.workspaceId !== workspace.id) {
    return { ok: false, error: "Member not found." };
  }
  // Self-removal allowed; otherwise OWNER required.
  if (target.id !== actor.id && actor.role !== Role.OWNER) {
    return { ok: false, error: "Only owners can remove members." };
  }
  if (target.role === Role.OWNER) {
    const ownerCount = await db.workspaceMember.count({
      where: { workspaceId: workspace.id, role: Role.OWNER },
    });
    if (ownerCount <= 1) {
      return { ok: false, error: "Cannot remove the last owner." };
    }
  }
  await db.workspaceMember.delete({ where: { id: memberId } });
  if (target.id === actor.id) {
    redirect("/onboarding");
  }
  revalidatePath(`/${workspace.slug}/settings/members`);
  return { ok: true };
}

// ───────────────────────────────────────────────── Invites

export async function createInviteAction(
  workspaceSlug: string,
  email: string,
  role: Role,
): Promise<ActionResult> {
  const { workspace, member } = await requireWorkspace(workspaceSlug);
  if (member.role !== Role.OWNER) {
    return { ok: false, error: "Only owners can send invites." };
  }
  const user = await requireUser();
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) {
    return { ok: false, fieldErrors: { email: "Enter a valid email address." } };
  }
  if (role === Role.OWNER && member.role !== Role.OWNER) {
    return { ok: false, error: "Only owners can invite new owners." };
  }

  // If the user already exists in the workspace, refuse.
  const existingUser = await db.user.findUnique({ where: { email: normalizedEmail } });
  if (existingUser) {
    const existingMember = await db.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId: workspace.id, userId: existingUser.id },
      },
    });
    if (existingMember) {
      return { ok: false, fieldErrors: { email: "That user is already a member." } };
    }
  }

  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  await db.workspaceInvite.create({
    data: {
      workspaceId: workspace.id,
      email: normalizedEmail,
      role,
      token,
      createdById: user.id,
      expiresAt,
    },
  });

  const acceptUrl = `${APP_URL}/invite/${token}`;
  await sendWorkspaceInviteEmail({
    to: normalizedEmail,
    workspaceName: workspace.name,
    inviterName: user.name ?? user.email,
    acceptUrl,
  });

  revalidatePath(`/${workspace.slug}/settings/invites`);
  return { ok: true };
}

export async function revokeInviteAction(
  workspaceSlug: string,
  inviteId: string,
): Promise<ActionResult> {
  const { workspace, member } = await requireWorkspace(workspaceSlug);
  if (member.role !== Role.OWNER) {
    return { ok: false, error: "Only owners can revoke invites." };
  }
  const invite = await db.workspaceInvite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.workspaceId !== workspace.id) {
    return { ok: false, error: "Invite not found." };
  }
  await db.workspaceInvite.delete({ where: { id: inviteId } });
  revalidatePath(`/${workspace.slug}/settings/invites`);
  return { ok: true };
}
