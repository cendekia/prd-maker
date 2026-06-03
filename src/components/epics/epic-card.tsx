"use client";

import type { ReactNode } from "react";
import { Pencil } from "lucide-react";

import type { EpicSummary } from "@/lib/agile";
import { cn } from "@/lib/utils";

interface Props {
  epic: EpicSummary;
  onOpen: () => void;
  onEdit: () => void;
  canEdit: boolean;
  /** Drag handle (carries dnd listeners) — only rendered when editable. */
  grip?: ReactNode;
  dragging?: boolean;
}

/** A single epic card: key, name, drag grip, and a PRD progress meter. */
export function EpicCard({ epic, onOpen, onEdit, canEdit, grip, dragging }: Props) {
  const pct =
    epic.pageCount > 0 ? Math.round((epic.doneCount / epic.pageCount) * 100) : 0;

  return (
    <div
      className={cn(
        "group rounded-[var(--radius-lg)] border bg-background p-3 shadow-[var(--shadow-xs)] transition-shadow hover:shadow-[var(--shadow-sm)]",
        dragging && "opacity-60",
      )}
      style={{ borderLeft: `3px solid ${epic.color}` }}
    >
      <div className="flex items-center gap-2">
        <span className="t-mono text-[11px] text-fg-3">{epic.key}</span>
        <div className="ml-auto flex items-center gap-0.5">
          {canEdit ? (
            <button
              type="button"
              aria-label="Edit epic"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="flex size-6 items-center justify-center rounded-[var(--radius-sm)] text-fg-3 opacity-0 transition-opacity hover:bg-bg-hover hover:text-fg-1 group-hover:opacity-100"
            >
              <Pencil className="size-3.5" />
            </button>
          ) : null}
          {grip}
        </div>
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="mt-1 block w-full text-left"
      >
        <span className="line-clamp-2 text-[13px] font-medium text-fg-1">
          {epic.name}
        </span>
      </button>

      <div className="mt-3 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-[var(--radius-full)] bg-bg-active">
          <div
            className="h-full rounded-[var(--radius-full)]"
            style={{ width: `${pct}%`, backgroundColor: epic.color }}
          />
        </div>
        <span className="shrink-0 text-[11px] text-fg-3">
          {epic.doneCount}/{epic.pageCount}
        </span>
      </div>
    </div>
  );
}
