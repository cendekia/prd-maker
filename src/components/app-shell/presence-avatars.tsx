"use client";

import { Avatar } from "@/components/ui/avatar";
import { usePresence } from "@/hooks/use-presence";
import { cn } from "@/lib/utils";

const MAX_VISIBLE = 5;

/**
 * Stack of avatars for everyone currently viewing the page (Yjs awareness).
 * Renders nothing in solo mode (no provider registered) — `usePresence`
 * returns an empty array, so this component returns null.
 */
export function PresenceAvatars({ className }: { className?: string }) {
  const users = usePresence();
  if (users.length === 0) return null;

  const visible = users.slice(0, MAX_VISIBLE);
  const overflow = users.slice(MAX_VISIBLE);

  return (
    <div className={cn("flex items-center", className)} aria-label="People on this page">
      {visible.map((u, i) => (
        <div
          key={u.userId}
          style={{ marginLeft: i === 0 ? 0 : -8, zIndex: 100 - i }}
          title={u.isSelf ? `${u.name} (you)` : u.name}
        >
          <Avatar
            name={u.name}
            src={u.avatarUrl}
            size="md"
            presenceColor={u.color}
          />
        </div>
      ))}
      {overflow.length > 0 ? (
        <OverflowChip count={overflow.length} users={overflow} />
      ) : null}
    </div>
  );
}

function OverflowChip({
  count,
  users,
}: {
  count: number;
  users: ReturnType<typeof usePresence>;
}) {
  return (
    <div className="group relative ml-1.5">
      <button
        type="button"
        aria-label={`${count} more viewers`}
        className="rounded-full border bg-bg-subtle px-1.5 py-0.5 text-[11px] font-medium text-fg-2 hover:bg-bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        +{count}
      </button>
      <div
        role="tooltip"
        className="invisible absolute right-0 top-full z-[var(--z-dropdown)] mt-1.5 w-56 rounded-[var(--radius-md)] border bg-popover p-1 opacity-0 shadow-[var(--shadow-md)] transition-[opacity,visibility] duration-100 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      >
        {users.map((u) => (
          <div
            key={u.userId}
            className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5"
          >
            <Avatar name={u.name} src={u.avatarUrl} size="sm" presenceColor={u.color} />
            <span className="min-w-0 flex-1 truncate text-[13px] text-fg-1">
              {u.name}
              {u.isSelf ? (
                <span className="ml-1 text-fg-3">(you)</span>
              ) : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
