"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogOut, Settings } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar } from "@/components/ui/avatar";

interface Props {
  user: { name: string | null; email: string };
  workspaceSlug: string;
}

/**
 * Top-bar account dropdown (Step 33). Houses the theme switcher, account
 * navigation, and sign-out — the theme toggle previously lived in the sidebar
 * footer. Lightweight popover built on the same click-outside / Escape pattern
 * as the page-tree row menu (no dropdown primitive in the kit).
 */
export function AccountMenu({ user, workspaceSlug }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const label = user.name ?? user.email.split("@")[0];

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Avatar name={label} size="md" />
      </button>

      {open ? (
        <div
          role="menu"
          className="pm-fade-in-up absolute right-0 top-full z-[var(--z-dropdown)] mt-2 w-60 overflow-hidden rounded-[var(--radius-lg)] border bg-popover p-1 shadow-[var(--shadow-lg)]"
        >
          <div className="flex items-center gap-2.5 px-2.5 py-2">
            <Avatar name={label} size="md" />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-fg-1">{label}</p>
              <p className="truncate text-[11px] text-fg-3">{user.email}</p>
            </div>
          </div>

          <div className="my-1 h-px bg-border" />

          <div className="px-2.5 py-1.5">
            <div className="t-label mb-1.5">Theme</div>
            <ThemeToggle variant="full" className="w-full justify-between" />
          </div>

          <div className="my-1 h-px bg-border" />

          <Link
            href={`/${workspaceSlug}/settings`}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[13px] text-fg-2 hover:bg-bg-hover hover:text-fg-1"
          >
            <Settings className="size-3.5" />
            Workspace settings
          </Link>
          <Link
            href="/api/auth/signout"
            role="menuitem"
            className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[13px] text-fg-2 hover:bg-bg-hover hover:text-fg-1"
          >
            <LogOut className="size-3.5" />
            Sign out
          </Link>
        </div>
      ) : null}
    </div>
  );
}
