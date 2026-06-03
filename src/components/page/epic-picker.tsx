"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Search } from "lucide-react";

import { type AgileEpicRef, type EpicSummary } from "@/lib/agile";
import { cn } from "@/lib/utils";

interface Props {
  workspaceId: string;
  editable: boolean;
  value: AgileEpicRef | null;
  onChange: (epic: AgileEpicRef | null) => void;
}

/** Epic field: a chip that opens a searchable list of workspace epics, with
 * inline "Create" for a new epic. Used by the agile properties bar. */
export function EpicPicker({ workspaceId, editable, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [epics, setEpics] = useState<EpicSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
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

  // Lazy-load epics the first time the picker opens.
  useEffect(() => {
    if (!open || epics !== null) return;
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/epics`);
        const d = await res.json().catch(() => ({}));
        if (alive) setEpics(res.ok ? (d.epics ?? []) : []);
      } catch {
        if (alive) setEpics([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, epics, workspaceId]);

  const q = query.trim().toLowerCase();
  const filtered = (epics ?? []).filter(
    (e) => e.name.toLowerCase().includes(q) || e.key.toLowerCase().includes(q),
  );
  const exactExists = (epics ?? []).some(
    (e) => e.name.trim().toLowerCase() === q && q.length > 0,
  );

  function select(epic: EpicSummary | null) {
    onChange(
      epic ? { id: epic.id, key: epic.key, name: epic.name, color: epic.color } : null,
    );
    setOpen(false);
    setQuery("");
  }

  async function createAndSelect() {
    const name = query.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/epics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Couldn’t create the epic.");
      const created = d.epic as EpicSummary;
      setEpics((prev) => (prev ? [created, ...prev] : [created]));
      select(created);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  const chip = (
    <>
      {value ? (
        <>
          <span
            className="size-2 shrink-0 rounded-[var(--radius-full)]"
            style={{ backgroundColor: value.color }}
          />
          <span className="truncate">{value.name}</span>
        </>
      ) : (
        <span className="text-fg-3">No epic</span>
      )}
      {editable ? <ChevronDown className="size-3 shrink-0 text-fg-4" /> : null}
    </>
  );

  const chipCls =
    "inline-flex h-7 max-w-[200px] items-center gap-1.5 rounded-[var(--radius-md)] border bg-background px-2 text-[12px] text-fg-2";

  if (!editable) {
    return <span className={cn(chipCls, "cursor-default")}>{chip}</span>;
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="Epic"
        onClick={() => setOpen((o) => !o)}
        className={cn(chipCls, "hover:bg-bg-hover hover:text-fg-1")}
      >
        {chip}
      </button>
      {open ? (
        <div className="pm-fade-in-up absolute left-0 top-full z-[var(--z-dropdown)] mt-1 w-64 rounded-[var(--radius-md)] border bg-popover p-1 shadow-[var(--shadow-lg)]">
          <div className="flex items-center gap-1.5 px-1.5 py-1">
            <Search className="size-3.5 text-fg-4" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search or create…"
              className="h-6 w-full bg-transparent text-[12px] text-fg-1 placeholder:text-fg-4 focus:outline-none"
            />
          </div>
          <div className="my-1 h-px bg-border" />
          <div className="max-h-56 overflow-y-auto">
            <button
              type="button"
              onClick={() => select(null)}
              className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-[12px] text-fg-2 hover:bg-bg-hover"
            >
              <span className="size-2 rounded-[var(--radius-full)] border border-border-strong" />
              No epic
              {value === null ? <Check className="ml-auto size-3.5 text-fg-3" /> : null}
            </button>

            {loading ? (
              <p className="px-2 py-2 text-[12px] text-fg-3">Loading…</p>
            ) : null}

            {!loading &&
              filtered.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => select(e)}
                  className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-[12px] text-fg-1 hover:bg-bg-hover"
                >
                  <span
                    className="size-2 shrink-0 rounded-[var(--radius-full)]"
                    style={{ backgroundColor: e.color }}
                  />
                  <span className="t-mono shrink-0 text-[10px] text-fg-3">{e.key}</span>
                  <span className="min-w-0 flex-1 truncate">{e.name}</span>
                  {value?.id === e.id ? <Check className="size-3.5 text-fg-3" /> : null}
                </button>
              ))}

            {!loading && q && !exactExists ? (
              <button
                type="button"
                disabled={creating}
                onClick={createAndSelect}
                className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-[12px] text-brand-600 hover:bg-bg-hover disabled:opacity-50"
              >
                <Plus className="size-3.5" />
                Create “{query.trim()}”
              </button>
            ) : null}

            {!loading && (epics?.length ?? 0) === 0 && !q ? (
              <p className="px-2 py-2 text-[12px] text-fg-3">
                No epics yet. Type a name to create one.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
