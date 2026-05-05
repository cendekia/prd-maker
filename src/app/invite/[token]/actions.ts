"use server";

import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/workspace";

interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function acceptInviteAction(token: string): Promise<ActionResult> {
  const user = await requireUser();

  const invite = await db.workspaceInvite.findUnique({
    where: { token },
    include: { workspace: { select: { slug: true } } },
  });
  if (!invite) {
    return { ok: false, error: "This invite link is invalid." };
  }
  if (invite.acceptedAt) {
    redirect(`/${invite.workspace.slug}`);
  }
  if (invite.expiresAt < new Date()) {
    return { ok: false, error: "This invite has expired." };
  }
  if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
    return {
      ok: false,
      error: `This invite was sent to ${invite.email}. Sign in with that address to accept.`,
    };
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
