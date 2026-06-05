import { db } from "@/lib/db";
import { requireUser } from "@/lib/workspace";

import { NotificationPreferencesForm } from "./notification-preferences-form";

export const metadata = { title: "Notifications — Account" };

export default async function AccountNotificationsPage() {
  const user = await requireUser();
  const prefs = await db.notificationPreference.findUnique({
    where: { userId: user.id },
  });

  // No row yet → email on by default for every type.
  const initial = {
    emailMention: prefs?.emailMention ?? true,
    emailReply: prefs?.emailReply ?? true,
    emailShare: prefs?.emailShare ?? true,
    emailInvite: prefs?.emailInvite ?? true,
  };

  return <NotificationPreferencesForm initial={initial} />;
}
