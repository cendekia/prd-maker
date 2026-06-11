"use client";

import { useMemo, useState } from "react";
import { FeatureLinkKind } from "@prisma/client";

import { Button } from "@/components/ui/button";
import {
  FEATURE_LINK_KIND_DESCRIPTIONS,
  FEATURE_LINK_KIND_LABELS,
  FEATURE_LINK_KIND_ORDER,
  type FeatureNode,
  type StackSummary,
} from "@/lib/agent/types";
import { cn } from "@/lib/utils";

const inputCls =
  "w-full rounded-[var(--radius-md)] border bg-background px-2.5 text-[13px] text-fg-1 placeholder:text-fg-4 focus:border-ring focus:outline-none focus-visible:shadow-[var(--shadow-focus)]";

interface Props {
  workspaceId: string;
  source: FeatureNode;
  features: FeatureNode[];
  stacks: StackSummary[];
  onCreated: () => void | Promise<void>;
  onCancel: () => void;
}

/** Inline form to wire the source feature to another one with a typed edge. */
export function LinkEditor({
  workspaceId,
  source,
  features,
  stacks,
  onCreated,
  onCancel,
}: Props) {
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [kind, setKind] = useState<FeatureLinkKind>(
    FeatureLinkKind.DEPENDS_ON,
  );
  const [query, setQuery] = useState("");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [rationale, setRationale] = useState("");
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

  async function save() {
    if (!target) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/feature-links`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromFeatureId: direction === "out" ? source.id : target.id,
            toFeatureId: direction === "out" ? target.id : source.id,
            kind,
            rationale: rationale.trim() || null,
          }),
        },
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Couldn’t create the link.");
      await onCreated();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="rounded-[var(--radius-md)] border bg-bg-subtle p-3">
      <div className="flex items-center gap-2">
        <div className="inline-flex items-center gap-px rounded-[var(--radius-md)] border bg-background p-0.5">
          {(
            [
              { id: "out", label: "Outgoing" },
              { id: "in", label: "Incoming" },
            ] as const
          ).map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setDirection(d.id)}
              className={cn(
                "rounded-[var(--radius-sm)] px-2 py-0.5 text-[11px] font-medium transition-colors",
                direction === d.id
                  ? "bg-bg-muted text-fg-1"
                  : "text-fg-3 hover:text-fg-1",
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
        <select
          aria-label="Link kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as FeatureLinkKind)}
          className={cn(inputCls, "h-7 flex-1 text-[12px]")}
        >
          {FEATURE_LINK_KIND_ORDER.map((k) => (
            <option key={k} value={k}>
              {FEATURE_LINK_KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </div>
      <p className="mt-1 text-[11px] text-fg-4">
        {direction === "out"
          ? `“${source.name}” ${FEATURE_LINK_KIND_LABELS[kind].toLowerCase()} the target`
          : `The target ${FEATURE_LINK_KIND_LABELS[kind].toLowerCase()} “${source.name}”`}{" "}
        — {FEATURE_LINK_KIND_DESCRIPTIONS[kind].toLowerCase()}.
      </p>

      <input
        aria-label="Search features to link"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setTargetId(null);
        }}
        placeholder="Search features…"
        className={cn(inputCls, "mt-2 h-8")}
      />
      <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
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

      <input
        aria-label="Rationale (optional)"
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
        placeholder="Why are these linked? (optional)"
        className={cn(inputCls, "mt-2 h-8")}
      />

      {error ? (
        <p className="mt-2 text-[12px] text-destructive">{error}</p>
      ) : null}

      <div className="mt-2 flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" onClick={save} disabled={saving || !target}>
          {saving ? "Adding…" : "Add link"}
        </Button>
      </div>
    </div>
  );
}
