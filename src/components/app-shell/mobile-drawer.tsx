"use client";

import { useEffect } from "react";

import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Accessible label for the dialog. */
  label?: string;
}

/**
 * Off-canvas left drawer for the mobile breakpoint (Step 32). Holds the
 * page-tree sidebar, which is an inline pane on desktop. Renders a dimmed
 * backdrop and a sliding panel; closes on backdrop click or Escape.
 *
 * The caller only mounts this below `md`, but it is also `md:hidden` as
 * defense in depth so it can never overlay the desktop layout.
 */
export function MobileDrawer({
  open,
  onClose,
  children,
  label = "Navigation",
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div className="md:hidden" aria-hidden={!open}>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/40 transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[var(--sidebar-width)] max-w-[85vw] transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {children}
      </div>
    </div>
  );
}
