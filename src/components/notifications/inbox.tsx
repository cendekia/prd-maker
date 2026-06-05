"use client";

import Link from "next/link";
import { Bell } from "lucide-react";

import {
  describeNotification,
  relativeTime,
  type InboxItem,
} from "@/lib/notification-display";

interface Props {
  items: InboxItem[];
  loading: boolean;
  onMarkAll: () => void;
  onOpenItem: (item: InboxItem) => void;
}

export function Inbox({ items, loading, onMarkAll, onOpenItem }: Props) {
  const hasUnread = items.some((i) => !i.readAt);
  return (
    <div
      role="menu"
      className="pm-fade-in-up absolute right-0 top-full z-[var(--z-dropdown)] mt-2 w-80 overflow-hidden rounded-[var(--radius-lg)] border bg-popover shadow-[var(--shadow-lg)]"
    >
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-[13px] font-medium text-fg-1">Notifications</span>
        {hasUnread ? (
          <button
            type="button"
            onClick={onMarkAll}
            className="text-[12px] text-link hover:underline"
          >
            Mark all read
          </button>
        ) : null}
      </div>

      <div className="max-h-96 overflow-y-auto">
        {loading && items.length === 0 ? (
          <p className="px-3 py-6 text-center text-[12px] text-fg-3">Loading…</p>
        ) : items.length === 0 ? (
          <div className="px-3 py-10 text-center">
            <Bell className="mx-auto size-5 text-fg-4" />
            <p className="mt-2 text-[12px] text-fg-3">You&apos;re all caught up</p>
          </div>
        ) : (
          items.map((item) => {
            const { text } = describeNotification(item.type, item.payload);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpenItem(item)}
                className="flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-bg-hover"
              >
                <span
                  className={
                    item.readAt
                      ? "mt-1.5 size-1.5 shrink-0"
                      : "mt-1.5 size-1.5 shrink-0 rounded-[var(--radius-full)] bg-brand-500"
                  }
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] leading-[18px] text-fg-1">
                    {text}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-fg-3">
                    {relativeTime(item.createdAt)}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>

      <div className="border-t px-3 py-2 text-center">
        <Link
          href="/account/notifications"
          className="text-[12px] text-fg-3 hover:text-fg-1"
        >
          Notification settings
        </Link>
      </div>
    </div>
  );
}
