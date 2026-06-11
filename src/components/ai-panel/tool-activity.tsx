"use client";

import { AlertTriangle, Check } from "lucide-react";

import type { AgentToolChip } from "@/hooks/use-agent-chat";
import { cn } from "@/lib/utils";

/** Friendly labels for the Step 47 tool names. */
const TOOL_LABELS: Record<string, string> = {
  list_stacks: "Listing stacks",
  list_features: "Searching features",
  get_feature: "Inspecting feature",
  search_pages: "Searching PRDs",
  read_page: "Reading PRD",
  propose_feature: "Suggesting feature",
  propose_link: "Suggesting link",
  link_page_feature: "Connecting PRD",
};

/**
 * Tool-call activity chips shown with an agent reply (Step 48): pulsing while
 * a call runs, a check when it succeeded, a warning when the tool errored.
 */
export function ToolActivity({ tools }: { tools: AgentToolChip[] }) {
  if (tools.length === 0) return null;
  return (
    <div className="mb-1.5 flex flex-wrap gap-1 pl-6">
      {tools.map((t, i) => (
        <span
          key={`${t.name}-${i}`}
          className={cn(
            "inline-flex items-center gap-1 rounded-[var(--radius-full)] border bg-background px-2 py-0.5 text-[11px]",
            t.done ? "text-fg-3" : "text-fg-2",
          )}
        >
          {!t.done ? (
            <span className="size-1.5 animate-pulse rounded-[var(--radius-full)] bg-brand-500" />
          ) : t.ok === false ? (
            <AlertTriangle className="size-3 text-[var(--warning-500)]" />
          ) : (
            <Check className="size-3 text-[var(--success-500)]" />
          )}
          {TOOL_LABELS[t.name] ?? t.name}
          {!t.done ? "…" : ""}
        </span>
      ))}
    </div>
  );
}
