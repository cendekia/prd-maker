"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { FeatureNode, StackSummary } from "@/lib/agent/types";
import { cn } from "@/lib/utils";

const inputCls =
  "w-full rounded-[var(--radius-md)] border bg-background px-3 text-[13px] text-fg-1 placeholder:text-fg-4 focus:border-ring focus:outline-none focus-visible:shadow-[var(--shadow-focus)]";

interface Props {
  workspaceId: string;
  /** The suggested duplicate being merged away. */
  source: { id: string; name: string };
  features: FeatureNode[];
  stacks: StackSummary[];
  onClose: () => void;
  onMerged: () => void;
}

/**
 * Merge-into-feature picker (Step 50): the duplicate's links and PRD
 * connections re-point to the chosen target, then the duplicate is archived.
 */
export function MergeDialog({
  workspaceId,
  source,
  features,
  stacks,
  onClose,
  onMerged,
}: Props) {
  const [query, setQuery] = useState("");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stackById = useMemo(
    () => new Map(stacks.map((s) => [s.id, s])),
    [stacks],
  );
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return features
      .filter((f) => f.id !== source.id)
      .filter((f) => !q || f.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [features, source.id, query]);

  const target = features.find((f) => f.id === targetId) ?? null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function merge() {
    if (!target) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/agent/suggestions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target: "feature",
            action: "merge",
            id: source.id,
            targetFeatureId: target.id,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn’t merge.");
      onMerged();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4">
      <div
        className="pm-fade-in absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Merge ${source.name}`}
        className="pm-pop-in relative w-full max-w-md rounded-[var(--radius-xl)] border bg-background p-5 shadow-[var(--shadow-xl)]"
      >
        <div className="flex items-center justify-between">
          <h2 className="t-h3">Merge “{source.name}”</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-[var(--radius-sm)] text-fg-3 hover:bg-bg-hover hover:text-fg-1"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-1.5 text-[12px] leading-[18px] text-fg-3">
          Its links and PRD connections move to the feature you pick; the
          duplicate is archived and its name won’t be re-proposed.
        </p>

        <input
          autoFocus
          aria-label="Search features"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setTargetId(null);
          }}
          placeholder="Search features…"
          className={cn(inputCls, "mt-3 h-9")}
        />
        <ul className="mt-1.5 max-h-52 space-y-0.5 overflow-y-auto">
          {candidates.map((f) => {
            const stack = stackById.get(f.stackId);
            return (
              <li key={f.id}>
                <button
                  type="button"
                  aria-pressed={targetId === f.id}
                  onClick={() => setTargetId(f.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left hover:bg-bg-hover",
                    targetId === f.id && "bg-bg-muted",
                  )}
                >
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-[var(--radius-full)]"
                    style={{ backgroundColor: stack?.color ?? "var(--fg-4)" }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-fg-1">
                    {f.name}
                  </span>
                  <span className="shrink-0 text-[11px] text-fg-4">
                    {stack?.name}
                  </span>
                </button>
              </li>
            );
          })}
          {candidates.length === 0 ? (
            <li className="px-2 py-1.5 text-[12px] text-fg-4">
              No other features match.
            </li>
          ) : null}
        </ul>

        {error ? (
          <p className="mt-3 text-[12px] text-destructive">{error}</p>
        ) : null}

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={merge} disabled={saving || !target}>
            {saving
              ? "Merging…"
              : target
                ? `Merge into “${target.name}”`
                : "Merge"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
