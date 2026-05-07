import "server-only";

/**
 * Notifications enqueue helper.
 *
 * Step 14 lands the call sites (e.g. on @mention in a comment) but the
 * `Notification` Prisma model + email delivery are added in Step 18. Until
 * then this helper logs in development and is a no-op in production so the
 * caller code can be written against a stable API today.
 */

export type NotificationType =
  | "comment.mention"
  | "comment.reply"
  | "page.share"
  | "workspace.invite";

export interface NotificationPayload {
  /** User who should receive the notification. */
  userId: string;
  type: NotificationType;
  /**
   * Type-specific structured payload. Stays loose for now — the Step 18 model
   * stores this as a `Json` column and each consumer renders by `type`.
   */
  data: Record<string, unknown>;
  /** Who triggered it (for "X mentioned you" lines). Optional for system events. */
  actorId?: string;
}

export async function enqueueNotification(payload: NotificationPayload): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    // Quiet enough to ignore in normal dev, loud enough to verify wiring.
    console.log(
      `[notifications:stub] ${payload.type} -> user ${payload.userId}`,
      payload.data,
    );
  }
  // No-op until Step 18 adds the Notification model + dispatch.
}
