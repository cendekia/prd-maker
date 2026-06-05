"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/workspace";

export interface NotificationPrefs {
  emailMention: boolean;
  emailReply: boolean;
  emailShare: boolean;
  emailInvite: boolean;
}

export async function saveNotificationPreferencesAction(
  prefs: NotificationPrefs,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const data = {
    emailMention: !!prefs.emailMention,
    emailReply: !!prefs.emailReply,
    emailShare: !!prefs.emailShare,
    emailInvite: !!prefs.emailInvite,
  };
  await db.notificationPreference.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });
  revalidatePath("/account/notifications");
  return { ok: true };
}
