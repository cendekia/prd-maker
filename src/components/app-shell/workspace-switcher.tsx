"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";

import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";
import type { WorkspaceSummary } from "@/lib/types";

interface Props {
  current: { id: string; name: string; slug: string };
  workspaces: WorkspaceSummary[];
}

export function WorkspaceSwitcher({ current, workspaces }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointer(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onPointer);
      document.addEventListener("keydown", onEsc);
      return () => {
        document.removeEventListener("mousedown", onPointer);
        document.removeEventListener("keydown", onEsc);
      };
    }
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-left transition-colors",
          "hover:bg-bg-hover focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]",
        )}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Logo variant="mark" size={20} />
        <span className="flex-1 truncate text-[13px] font-medium text-fg-1">
          {current.name}
        </span>
        <ChevronDown className="size-3.5 text-fg-3" />
      </button>

      {open ? (
        <div
          className="absolute left-0 right-0 top-full z-[var(--z-dropdown)] mt-1 rounded-[var(--radius-md)] border bg-popover text-popover-foreground p-1 shadow-[var(--shadow-lg)]"
          role="menu"
        >
          <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-fg-3">
            Workspaces
          </div>
          {workspaces.map((w) => {
            const isCurrent = w.id === current.id;
            return (
              <Link
                key={w.id}
                href={`/${w.slug}`}
                className={cn(
                  "flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-[13px]",
                  isCurrent ? "bg-bg-active text-fg-1" : "text-fg-2 hover:bg-bg-hover hover:text-fg-1",
                )}
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                <span className="flex-1 truncate">{w.name}</span>
                {isCurrent ? <Check className="size-3.5 text-fg-3" /> : null}
              </Link>
            );
          })}
          <div className="my-1 h-px bg-border" />
          <Link
            href="/onboarding"
            className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-[13px] text-fg-2 hover:bg-bg-hover hover:text-fg-1"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <Plus className="size-3.5" />
            Create workspace
          </Link>
        </div>
      ) : null}
    </div>
  );
}
