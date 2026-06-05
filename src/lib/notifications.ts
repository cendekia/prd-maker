import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { sendNotificationEmail } from "@/lib/email";

export type NotificationType =
  | "comment.mention"
  | "comment.reply"
  | "page.share"
  | "workspace.invite";

export interface NotificationInput {
  /** User who should receive the notification. */
  userId: string;
  type: NotificationType;
  /** Type-specific data. `pageId` (if present) is resolved to a title + link. */
  data: Record<string, unknown>;
  /** Who triggered it (for "X mentioned you" lines). Optional for system events. */
  actorId?: string;
}

/** Denormalized payload stored on the Notification row and used to render both
 * the in-app inbox line and the email — no joins needed at render time. */
export interface NotificationData {
  actorName?: string;
  pageId?: string;
  pageTitle?: string;
  workspaceSlug?: string;
  commentId?: string;
  /** App-relative link, e.g. `/acme/p/abc123`. */
  url?: string;
  [key: string]: unknown;
}

const EMAIL_PREF_FIELD: Record<
  NotificationType,
  "emailMention" | "emailReply" | "emailShare" | "emailInvite"
> = {
  "comment.mention": "emailMention",
  "comment.reply": "emailReply",
  "page.share": "emailShare",
  "workspace.invite": "emailInvite",
};

/**
 * Create an in-app notification and, per the recipient's preferences, send an
 * email. Never throws — a notification is a side effect and must not break the
 * action that triggered it.
 */
export async function enqueueNotification(input: NotificationInput): Promise<void> {
  try {
    const payload = await buildPayload(input);
    await db.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        payload: payload as Prisma.InputJsonValue,
      },
    });

    const prefs = await db.notificationPreference.findUnique({
      where: { userId: input.userId },
    });
    // No preference row yet → default to sending email.
    const emailEnabled = prefs ? prefs[EMAIL_PREF_FIELD[input.type]] : true;
    if (emailEnabled) {
      const user = await db.user.findUnique({
        where: { id: input.userId },
        select: { email: true },
      });
      if (user?.email) {
        await sendNotificationEmail({ to: user.email, type: input.type, payload });
      }
    }
  } catch (err) {
    console.error("[notifications] enqueue failed:", err);
  }
}

async function buildPayload(input: NotificationInput): Promise<NotificationData> {
  const out: NotificationData = { ...input.data };

  if (input.actorId) {
    const actor = await db.user.findUnique({
      where: { id: input.actorId },
      select: { name: true, email: true },
    });
    out.actorName = actor?.name ?? actor?.email ?? "Someone";
  }

  const pageId = typeof input.data.pageId === "string" ? input.data.pageId : undefined;
  if (pageId) {
    const page = await db.page.findUnique({
      where: { id: pageId },
      select: { title: true, workspace: { select: { slug: true } } },
    });
    if (page) {
      out.pageId = pageId;
      out.pageTitle = page.title;
      out.workspaceSlug = page.workspace.slug;
      out.url = `/${page.workspace.slug}/p/${pageId}`;
    }
  }

  return out;
}
