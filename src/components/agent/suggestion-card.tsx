"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Shell for one pending agent suggestion (Step 50) — dashed border to match
 * the "unconfirmed" visual language used across the Features surface.
 */
export function SuggestionCard({
  children,
  actions,
  busy,
}: {
  children: ReactNode;
  actions?: ReactNode;
  busy?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border border-dashed bg-background p-3",
        busy && "pointer-events-none opacity-60",
      )}
    >
      {children}
      {actions ? (
        <div className="mt-2.5 flex items-center justify-end gap-1.5">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

/** The agent's 0–1 confidence rendered as a small pill. */
export function ConfidencePill({ value }: { value: number | null }) {
  if (value === null) return null;
  return (
    <span className="shrink-0 rounded-[var(--radius-full)] bg-bg-muted px-1.5 py-0.5 text-[10px] text-fg-3">
      {Math.round(value * 100)}% sure
    </span>
  );
}
