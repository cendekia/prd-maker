"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PageFeatureRole } from "@prisma/client";
import { Network, Plus, Search, X } from "lucide-react";

import {
  PAGE_FEATURE_ROLE_COLORS,
  PAGE_FEATURE_ROLE_LABELS,
  type PageFeatureItem,
  type WorkspaceGraph,
} from "@/lib/agent/types";
import { cn } from "@/lib/utils";

const chipBase =
  "inline-flex h-7 max-w-[220px] items-center gap-1.5 rounded-[var(--radius-md)] border bg-background px-2 text-[12px] text-fg-2";

/** Roles humans set from a PRD: spec it, or change-request it. */
const PICKER_ROLES = [PageFeatureRole.DEFINES, PageFeatureRole.MODIFIES];

interface Props {
  pageId: string;
  workspaceId: string;
  editable: boolean;
  value: PageFeatureItem[];
  onChange: (items: PageFeatureItem[]) => void;
}

/**
 * Properties-bar "Features" field (Step 52): chips for the features this PRD
 * defines or modifies (MODIFIES = change request), plus a picker that joins
 * existing features — or creates one inline — born CONFIRMED/MANUAL.
 */
export function FeatureLinksField({
  pageId,
  workspaceId,
  editable,
  value,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<PageFeatureRole>(PageFeatureRole.DEFINES);
  const [query, setQuery] = useState("");
  const [graph, setGraph] = useState<WorkspaceGraph | null>(null);
  const [creating, setCreating] = useState(false);
  const [createStackId, setCreateStackId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Load the catalog lazily, once per popover session.
  useEffect(() => {
    if (!open || graph) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/features`);
        const d = await res.json().catch(() => ({}));
        if (alive && res.ok) setGraph(d.graph as WorkspaceGraph);
      } catch {
        /* picker shows the empty state */
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, graph, workspaceId]);

  const joinedIds = useMemo(
    () => new Set(value.map((v) => v.featureId)),
    [value],
  );
  const candidates = useMemo(() => {
    if (!graph) return [];
    const q = query.trim().toLowerCase();
    return graph.features
      .filter((f) => !joinedIds.has(f.id))
      .filter((f) => !q || f.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [graph, joinedIds, query]);
  const exactMatch = useMemo(() => {
    const q = query.trim().toLowerCase();
    return !!q && !!graph?.features.some((f) => f.name.toLowerCase() === q);
  }, [graph, query]);

  async function join(featureId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/pages/${pageId}/features`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featureId, role }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Couldn’t connect the feature.");
      onChange([...value, d.feature as PageFeatureItem]);
      setQuery("");
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createAndJoin() {
    const name = query.trim();
    if (!name || !createStackId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/features`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stackId: createStackId,
          name,
          summary: `Introduced by this PRD.`,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Couldn’t create the feature.");
      setGraph(null); // refetch next open — the catalog changed
      await join((d.feature as { id: string }).id);
      setCreating(false);
      setCreateStackId(null);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function remove(item: PageFeatureItem) {
    setError(null);
    const snapshot = value;
    onChange(value.filter((v) => v.id !== item.id));
    try {
      const res = await fetch(`/api/pages/${pageId}/features`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageFeatureId: item.id }),
      });
      if (!res.ok) {
        throw new Error(
          (await res.json().catch(() => ({}))).error ?? "Couldn’t remove.",
        );
      }
    } catch (e) {
      onChange(snapshot);
      alert((e as Error).message);
    }
  }

  return (
    <>
      {value.map((item) => (
        <span
          key={item.id}
          className={cn(
            chipBase,
            item.status === "SUGGESTED" && "border-dashed",
          )}
          title={`${PAGE_FEATURE_ROLE_LABELS[item.role]} · ${item.stackName}${item.status === "SUGGESTED" ? " · suggested by the agent" : ""}`}
        >
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-[var(--radius-full)]"
            style={{ backgroundColor: item.stackColor }}
          />
          <span
            className="shrink-0 text-[10px] font-medium uppercase tracking-wide"
            style={{ color: PAGE_FEATURE_ROLE_COLORS[item.role] }}
          >
            {PAGE_FEATURE_ROLE_LABELS[item.role]}
          </span>
          <span className="truncate">{item.name}</span>
          {editable ? (
            <button
              type="button"
              aria-label={`Disconnect ${item.name}`}
              onClick={() => remove(item)}
              className="shrink-0 text-fg-4 hover:text-destructive"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </span>
      ))}

      {editable ? (
        <div className="relative" ref={ref}>
          <button
            type="button"
            aria-label="Connect a feature"
            onClick={() => setOpen((o) => !o)}
            className={cn(chipBase, "hover:bg-bg-hover hover:text-fg-1")}
          >
            <Network className="size-3.5 shrink-0 text-fg-4" />
            <span className="text-fg-3">Feature</span>
            <Plus className="size-3 shrink-0 text-fg-4" />
          </button>

          {open ? (
            <div className="pm-fade-in-up absolute left-0 top-full z-[var(--z-dropdown)] mt-1 w-72 rounded-[var(--radius-md)] border bg-popover p-1 shadow-[var(--shadow-lg)]">
              <div className="flex items-center gap-1 px-1 pb-1 pt-0.5">
                {PICKER_ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    aria-pressed={role === r}
                    className={cn(
                      "rounded-[var(--radius-sm)] px-2 py-1 text-[11px] font-medium transition-colors",
                      role === r
                        ? "bg-bg-active text-fg-1"
                        : "text-fg-3 hover:text-fg-1",
                    )}
                  >
                    {PAGE_FEATURE_ROLE_LABELS[r]}
                  </button>
                ))}
                <span className="ml-auto pr-1 text-[10px] text-fg-4">
                  {role === PageFeatureRole.MODIFIES
                    ? "change request"
                    : "specs it"}
                </span>
              </div>

              <div className="flex items-center gap-1.5 px-1.5 py-1">
                <Search className="size-3.5 text-fg-4" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setCreating(false);
                  }}
                  placeholder="Search features…"
                  className="h-6 w-full bg-transparent text-[12px] text-fg-1 placeholder:text-fg-4 focus:outline-none"
                />
              </div>
              <div className="my-1 h-px bg-border" />

              <div className="max-h-56 overflow-y-auto">
                {!graph ? (
                  <p className="px-2 py-2 text-[12px] text-fg-3">Loading…</p>
                ) : (
                  <>
                    {candidates.map((f) => {
                      const stack = graph.stacks.find(
                        (s) => s.id === f.stackId,
                      );
                      return (
                        <button
                          key={f.id}
                          type="button"
                          disabled={busy}
                          onClick={() => join(f.id)}
                          className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-[12px] text-fg-1 hover:bg-bg-hover disabled:opacity-50"
                        >
                          <span
                            aria-hidden
                            className="size-2 shrink-0 rounded-[var(--radius-full)]"
                            style={{
                              backgroundColor: stack?.color ?? "var(--fg-4)",
                            }}
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {f.name}
                          </span>
                          <span className="shrink-0 text-[11px] text-fg-4">
                            {stack?.name}
                          </span>
                        </button>
                      );
                    })}
                    {candidates.length === 0 && !query ? (
                      <p className="px-2 py-2 text-[12px] text-fg-3">
                        No features yet — type a name to create one.
                      </p>
                    ) : null}
                    {query.trim() && !exactMatch ? (
                      creating ? (
                        <div className="px-2 py-1.5">
                          <p className="mb-1 text-[11px] text-fg-3">
                            Stack for “{query.trim()}”:
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {graph.stacks.map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                disabled={busy}
                                onClick={() => setCreateStackId(s.id)}
                                aria-pressed={createStackId === s.id}
                                className={cn(
                                  "flex items-center gap-1 rounded-[var(--radius-sm)] border px-1.5 py-0.5 text-[11px]",
                                  createStackId === s.id
                                    ? "border-fg-1 bg-bg-muted text-fg-1"
                                    : "border-input text-fg-3 hover:text-fg-1",
                                )}
                              >
                                <span
                                  aria-hidden
                                  className="size-1.5 rounded-[var(--radius-full)]"
                                  style={{ backgroundColor: s.color }}
                                />
                                {s.name}
                              </button>
                            ))}
                          </div>
                          <button
                            type="button"
                            disabled={busy || !createStackId}
                            onClick={createAndJoin}
                            className="mt-1.5 w-full rounded-[var(--radius-sm)] bg-primary px-2 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                          >
                            {busy ? "Creating…" : "Create & connect"}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setCreating(true)}
                          className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-[12px] text-fg-2 hover:bg-bg-hover"
                        >
                          <Plus className="size-3.5 text-fg-4" />
                          Create “{query.trim()}”…
                        </button>
                      )
                    ) : null}
                  </>
                )}
              </div>

              {error ? (
                <p className="px-2 py-1 text-[11px] text-destructive">{error}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
