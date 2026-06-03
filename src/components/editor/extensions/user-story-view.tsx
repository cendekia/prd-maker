"use client";

import { useState } from "react";
import type { AgileStatus } from "@prisma/client";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";

import {
  AGILE_STATUS_COLORS,
  AGILE_STATUS_LABELS,
  AGILE_STATUS_ORDER,
} from "@/lib/agile";
import { cn } from "@/lib/utils";

import type { EpicStory } from "./epic-block";

const STORY_POINTS = [1, 2, 3, 5, 8, 13];

const segInput =
  "min-w-[56px] flex-1 border-b border-dashed border-border bg-transparent px-0.5 text-[13px] text-fg-1 placeholder:text-fg-4 focus:border-ring focus:outline-none";
const iconBtn =
  "flex size-6 items-center justify-center rounded-[var(--radius-sm)] text-fg-3 hover:bg-bg-hover hover:text-fg-1";

interface Props {
  story: EpicStory;
  editable: boolean;
  onChange: (patch: Partial<EpicStory>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

export function UserStoryView({
  story,
  editable,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: Props) {
  // Local buffers so typing doesn't fire a transaction per keystroke; commit
  // on blur. Discrete controls (status/points/move/remove) commit immediately.
  const [title, setTitle] = useState(story.title);
  const [asA, setAsA] = useState(story.asA);
  const [iWant, setIWant] = useState(story.iWant);
  const [soThat, setSoThat] = useState(story.soThat);
  const [acceptance, setAcceptance] = useState(story.acceptance);

  if (!editable) {
    const hasTemplate = story.asA || story.iWant || story.soThat;
    return (
      <div className="rounded-[var(--radius-md)] border border-border bg-background p-3">
        <div className="flex items-center gap-2">
          <span
            className="size-1.5 rounded-[var(--radius-full)]"
            style={{ backgroundColor: AGILE_STATUS_COLORS[story.status] }}
          />
          <span className="text-[11px] text-fg-3">
            {AGILE_STATUS_LABELS[story.status]}
          </span>
          {story.points != null ? (
            <span className="text-[11px] text-fg-3">· {story.points} pts</span>
          ) : null}
        </div>
        <p className="mt-1 text-[14px] font-medium text-fg-1">
          {story.title || "Untitled story"}
        </p>
        {hasTemplate ? (
          <p className="mt-1 text-[13px] text-fg-2">
            As a {story.asA || "…"}, I want {story.iWant || "…"}, so that{" "}
            {story.soThat || "…"}.
          </p>
        ) : null}
        {story.acceptance ? (
          <p className="mt-1 whitespace-pre-wrap text-[13px] text-fg-2">
            <span className="t-label">Acceptance</span>
            <br />
            {story.acceptance}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-background p-3">
      <div className="flex items-center gap-1.5">
        <span
          className="size-2 shrink-0 rounded-[var(--radius-full)]"
          style={{ backgroundColor: AGILE_STATUS_COLORS[story.status] }}
        />
        <select
          aria-label="Story status"
          value={story.status}
          onChange={(e) => onChange({ status: e.target.value as AgileStatus })}
          onKeyDown={(e) => e.stopPropagation()}
          className="h-6 rounded-[var(--radius-sm)] border bg-background px-1 text-[11px] text-fg-2"
        >
          {AGILE_STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {AGILE_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          aria-label="Story points"
          value={story.points ?? ""}
          onChange={(e) =>
            onChange({ points: e.target.value === "" ? null : Number(e.target.value) })
          }
          onKeyDown={(e) => e.stopPropagation()}
          className="h-6 rounded-[var(--radius-sm)] border bg-background px-1 text-[11px] text-fg-2"
        >
          <option value="">– pts</option>
          {STORY_POINTS.map((n) => (
            <option key={n} value={n}>
              {n} pts
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-0.5">
          <button type="button" aria-label="Move story up" onClick={onMoveUp} className={iconBtn}>
            <ChevronUp className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Move story down"
            onClick={onMoveDown}
            className={iconBtn}
          >
            <ChevronDown className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Remove story"
            onClick={onRemove}
            className={cn(iconBtn, "hover:text-destructive")}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      <input
        aria-label="Story title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => title !== story.title && onChange({ title })}
        onKeyDown={(e) => e.stopPropagation()}
        placeholder="Story title"
        className="mt-2 w-full bg-transparent text-[14px] font-medium text-fg-1 placeholder:text-fg-4 focus:outline-none"
      />

      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-[13px] text-fg-2">
        <span className="text-fg-4">As a</span>
        <input
          aria-label="As a (role)"
          value={asA}
          onChange={(e) => setAsA(e.target.value)}
          onBlur={() => asA !== story.asA && onChange({ asA })}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder="role"
          className={segInput}
        />
        <span className="text-fg-4">I want</span>
        <input
          aria-label="I want"
          value={iWant}
          onChange={(e) => setIWant(e.target.value)}
          onBlur={() => iWant !== story.iWant && onChange({ iWant })}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder="capability"
          className={segInput}
        />
        <span className="text-fg-4">so that</span>
        <input
          aria-label="So that (benefit)"
          value={soThat}
          onChange={(e) => setSoThat(e.target.value)}
          onBlur={() => soThat !== story.soThat && onChange({ soThat })}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder="benefit"
          className={segInput}
        />
      </div>

      <textarea
        aria-label="Acceptance criteria"
        value={acceptance}
        onChange={(e) => setAcceptance(e.target.value)}
        onBlur={() => acceptance !== story.acceptance && onChange({ acceptance })}
        onKeyDown={(e) => e.stopPropagation()}
        rows={2}
        placeholder="Acceptance criteria…"
        className="mt-2 w-full resize-none bg-transparent text-[13px] text-fg-2 placeholder:text-fg-4 focus:outline-none"
      />
    </div>
  );
}
