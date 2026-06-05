import type { NotificationData, NotificationType } from "@/lib/notifications";

// Client-safe rendering of notifications. The `import type` above is erased at
// build time, so this module never pulls the server-only notifications.ts into
// a client bundle.

export interface InboxItem {
  id: string;
  type: NotificationType;
  payload: NotificationData;
  readAt: string | null;
  createdAt: string;
}

/** One-line summary + destination link for a notification. */
export function describeNotification(
  type: NotificationType,
  payload: NotificationData,
): { text: string; href: string | null } {
  const actor = payload.actorName ?? "Someone";
  const page = payload.pageTitle ?? "a page";
  const href = payload.url ?? null;
  switch (type) {
    case "comment.mention":
      return { text: `${actor} mentioned you in ${page}`, href };
    case "comment.reply":
      return { text: `${actor} replied in ${page}`, href };
    case "page.share":
      return { text: `${actor} shared ${page} with you`, href };
    case "workspace.invite":
      return { text: "You have a new workspace invitation", href };
    default:
      return { text: "New notification", href };
  }
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
