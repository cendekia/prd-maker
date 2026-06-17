"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AgileStatus, Priority } from "@prisma/client";
import {
  Check,
  ChevronDown,
  ExternalLink,
  Flag,
  Hash,
  Link2,
  Milestone,
  Search,
  User,
} from "lucide-react";

import {
  AGILE_STATUS_COLORS,
  AGILE_STATUS_LABELS,
  AGILE_STATUS_ORDER,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  type AgileAssigneeRef,
  type PageAgileInitial,
} from "@/lib/agile";
import { cn } from "@/lib/utils";

import { EpicPicker } from "./epic-picker";

const POINTS = [1, 2, 3, 5, 8, 13, 21];

const chipBase =
  "inline-flex h-7 max-w-[180px] items-center gap-1.5 rounded-[var(--radius-md)] border bg-background px-2 text-[12px] text-fg-2";

interface AgilePatch {
  epicId?: string | null;
  agileStatus?: AgileStatus;
  priority?: Priority | null;
  storyPoints?: number | null;
  targetSprint?: string | null;
  assigneeId?: string | null;
  externalUrl?: string | null;
}

interface Props {
  pageId: string;
  workspaceId: string;
  editable: boolean;
  initial: PageAgileInitial;
  /** Extra fields appended to the bar (Step 52 mounts the Features field). */
  trailing?: ReactNode;
}

export function AgilePropertiesBar({
  pageId,
  workspaceId,
  editable,
  initial,
  trailing,
}: Props) {
  const [meta, setMeta] = useState<PageAgileInitial>(initial);

  async function patch(changes: AgilePatch, optimistic: Partial<PageAgileInitial>) {
    const snapshot = meta;
    setMeta((m) => ({ ...m, ...optimistic }));
    try {
      const res = await fetch(`/api/pages/${pageId}/agile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      if (!res.ok) {
        throw new Error(
          (await res.json().catch(() => ({}))).error ?? "Couldn’t update.",
        );
      }
    } catch (e) {
      setMeta(snapshot);
      alert((e as Error).message);
    }
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-1.5">
      <EpicPicker
        workspaceId={workspaceId}
        editable={editable}
        value={meta.epic}
        onChange={(epic) =>
          patch({ epicId: epic?.id ?? null }, { epic, epicId: epic?.id ?? null })
        }
      />

      <Popover
        editable={editable}
        label="Status"
        chip={
          <>
            <Dot color={AGILE_STATUS_COLORS[meta.agileStatus]} />
            <span>{AGILE_STATUS_LABELS[meta.agileStatus]}</span>
            {editable ? <ChevronDown className="size-3 shrink-0 text-fg-4" /> : null}
          </>
        }
      >
        {(close) =>
          AGILE_STATUS_ORDER.map((s) => (
            <MenuButton
              key={s}
              active={meta.agileStatus === s}
              onClick={() => {
                patch({ agileStatus: s }, { agileStatus: s });
                close();
              }}
            >
              <Dot color={AGILE_STATUS_COLORS[s]} />
              {AGILE_STATUS_LABELS[s]}
            </MenuButton>
          ))
        }
      </Popover>

      <Popover
        editable={editable}
        label="Priority"
        chip={
          <>
            <Flag
              className="size-3.5 shrink-0"
              style={{ color: meta.priority ? PRIORITY_COLORS[meta.priority] : "var(--fg-4)" }}
            />
            {meta.priority ? (
              <span>{PRIORITY_LABELS[meta.priority]}</span>
            ) : (
              <span className="text-fg-3">Priority</span>
            )}
            {editable ? <ChevronDown className="size-3 shrink-0 text-fg-4" /> : null}
          </>
        }
      >
        {(close) => (
          <>
            <MenuButton
              active={meta.priority === null}
              onClick={() => {
                patch({ priority: null }, { priority: null });
                close();
              }}
            >
              <Flag className="size-3.5 text-fg-4" />
              None
            </MenuButton>
            {PRIORITY_ORDER.map((p) => (
              <MenuButton
                key={p}
                active={meta.priority === p}
                onClick={() => {
                  patch({ priority: p }, { priority: p });
                  close();
                }}
              >
                <Flag className="size-3.5" style={{ color: PRIORITY_COLORS[p] }} />
                {PRIORITY_LABELS[p]}
              </MenuButton>
            ))}
          </>
        )}
      </Popover>

      <Popover
        editable={editable}
        label="Story points"
        width={184}
        chip={
          <>
            <Hash className="size-3 shrink-0 text-fg-4" />
            {meta.storyPoints != null ? (
              <span>{meta.storyPoints}</span>
            ) : (
              <span className="text-fg-3">Points</span>
            )}
          </>
        }
      >
        {(close) => (
          <div className="p-1">
            <div className="flex flex-wrap gap-1">
              {POINTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    patch({ storyPoints: n }, { storyPoints: n });
                    close();
                  }}
                  className={cn(
                    "flex h-7 w-9 items-center justify-center rounded-[var(--radius-sm)] border text-[12px]",
                    meta.storyPoints === n
                      ? "border-brand-300 bg-brand-50 text-brand-700"
                      : "text-fg-2 hover:bg-bg-hover hover:text-fg-1",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
            {meta.storyPoints != null ? (
              <button
                type="button"
                onClick={() => {
                  patch({ storyPoints: null }, { storyPoints: null });
                  close();
                }}
                className="mt-1 w-full rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-[12px] text-fg-3 hover:bg-bg-hover"
              >
                Clear
              </button>
            ) : null}
          </div>
        )}
      </Popover>

      <Popover
        editable={editable}
        label="Sprint"
        width={224}
        chip={
          <>
            <Milestone className="size-3 shrink-0 text-fg-4" />
            {meta.targetSprint ? (
              <span className="truncate">{meta.targetSprint}</span>
            ) : (
              <span className="text-fg-3">Sprint</span>
            )}
          </>
        }
      >
        {(close) => (
          <TextEditPanel
            initial={meta.targetSprint ?? ""}
            placeholder="e.g. Sprint 24"
            onSave={(v) => {
              const val = v.trim() || null;
              patch({ targetSprint: val }, { targetSprint: val });
              close();
            }}
            onClear={
              meta.targetSprint
                ? () => {
                    patch({ targetSprint: null }, { targetSprint: null });
                    close();
                  }
                : undefined
            }
          />
        )}
      </Popover>

      <AssigneePicker
        workspaceId={workspaceId}
        editable={editable}
        value={meta.assignee}
        onChange={(u) =>
          patch({ assigneeId: u?.id ?? null }, { assignee: u, assigneeId: u?.id ?? null })
        }
      />

      <Popover
        editable={editable}
        label="External link"
        width={264}
        align="right"
        chip={
          <>
            <Link2 className="size-3 shrink-0 text-fg-4" />
            {meta.externalUrl ? (
              <span className="max-w-[120px] truncate">{hostOf(meta.externalUrl)}</span>
            ) : (
              <span className="text-fg-3">Link</span>
            )}
          </>
        }
      >
        {(close) => (
          <UrlEditPanel
            current={meta.externalUrl}
            onSave={(v) => {
              const val = v.trim() || null;
              patch({ externalUrl: val }, { externalUrl: val });
              close();
            }}
            onClear={
              meta.externalUrl
                ? () => {
                    patch({ externalUrl: null }, { externalUrl: null });
                    close();
                  }
                : undefined
            }
          />
        )}
      </Popover>

      {trailing}
    </div>
  );
}

/* ------------------------------- pieces -------------------------------- */

function Dot({ color }: { color: string }) {
  return (
    <span
      className="size-2 shrink-0 rounded-[var(--radius-full)]"
      style={{ backgroundColor: color }}
    />
  );
}

function Popover({
  editable,
  label,
  chip,
  width = 200,
  align = "left",
  children,
}: {
  editable: boolean;
  label: string;
  chip: ReactNode;
  width?: number;
  align?: "left" | "right";
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
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

  if (!editable) {
    return <span className={cn(chipBase, "cursor-default")}>{chip}</span>;
  }
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className={cn(chipBase, "hover:bg-bg-hover hover:text-fg-1")}
      >
        {chip}
      </button>
      {open ? (
        <div
          style={{ width }}
          className={cn(
            "pm-fade-in-up absolute top-full z-[var(--z-dropdown)] mt-1 rounded-[var(--radius-md)] border bg-popover p-1 shadow-[var(--shadow-lg)]",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

function MenuButton({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-[12px] text-fg-1 hover:bg-bg-hover"
    >
      {children}
      {active ? <Check className="ml-auto size-3.5 text-fg-3" /> : null}
    </button>
  );
}

function TextEditPanel({
  initial,
  placeholder,
  onSave,
  onClear,
}: {
  initial: string;
  placeholder?: string;
  onSave: (v: string) => void;
  onClear?: () => void;
}) {
  const [v, setV] = useState(initial);
  return (
    <div className="p-1">
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSave(v);
          }
        }}
        placeholder={placeholder}
        maxLength={80}
        className="h-8 w-full rounded-[var(--radius-sm)] border bg-background px-2 text-[12px] text-fg-1 placeholder:text-fg-4 focus:border-ring focus:outline-none"
      />
      <div className="mt-1 flex items-center justify-between">
        {onClear ? (
          <button
            type="button"
            onClick={onClear}
            className="rounded-[var(--radius-sm)] px-2 py-1 text-[12px] text-fg-3 hover:bg-bg-hover"
          >
            Clear
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => onSave(v)}
          className="rounded-[var(--radius-sm)] bg-primary px-2.5 py-1 text-[12px] font-medium text-primary-foreground hover:bg-primary/90"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function UrlEditPanel({
  current,
  onSave,
  onClear,
}: {
  current: string | null;
  onSave: (v: string) => void;
  onClear?: () => void;
}) {
  const [v, setV] = useState(current ?? "");
  return (
    <div className="p-1">
      {current ? (
        <a
          href={current}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-1 flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-[12px] text-link hover:bg-bg-hover hover:underline"
        >
          <ExternalLink className="size-3.5 shrink-0" />
          <span className="truncate">{current}</span>
        </a>
      ) : null}
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSave(v);
          }
        }}
        placeholder="https://… (Jira, Linear, …)"
        maxLength={2000}
        className="h-8 w-full rounded-[var(--radius-sm)] border bg-background px-2 text-[12px] text-fg-1 placeholder:text-fg-4 focus:border-ring focus:outline-none"
      />
      <div className="mt-1 flex items-center justify-between">
        {onClear ? (
          <button
            type="button"
            onClick={onClear}
            className="rounded-[var(--radius-sm)] px-2 py-1 text-[12px] text-fg-3 hover:bg-bg-hover"
          >
            Clear
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => onSave(v)}
          className="rounded-[var(--radius-sm)] bg-primary px-2.5 py-1 text-[12px] font-medium text-primary-foreground hover:bg-primary/90"
        >
          Save
        </button>
      </div>
    </div>
  );
}

interface Member {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

function AssigneePicker({
  workspaceId,
  editable,
  value,
  onChange,
}: {
  workspaceId: string;
  editable: boolean;
  value: AgileAssigneeRef | null;
  onChange: (u: AgileAssigneeRef | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
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

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    const url = new URL(
      `/api/workspaces/${workspaceId}/members/search`,
      window.location.origin,
    );
    if (query) url.searchParams.set("q", query);
    url.searchParams.set("limit", "8");
    (async () => {
      try {
        const res = await fetch(url.toString());
        const d = await res.json().catch(() => ({}));
        if (alive) setMembers(res.ok ? (d.results ?? []) : []);
      } catch {
        if (alive) setMembers([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, query, workspaceId]);

  const label = value ? value.name ?? value.email : "Assignee";
  const chipCls =
    "inline-flex h-7 max-w-[180px] items-center gap-1.5 rounded-[var(--radius-md)] border bg-background px-2 text-[12px] text-fg-2";

  const chip = (
    <>
      {value ? (
        <Initial name={value.name ?? value.email} />
      ) : (
        <User className="size-3.5 shrink-0 text-fg-4" />
      )}
      <span className="truncate">{label}</span>
      {editable ? <ChevronDown className="size-3 shrink-0 text-fg-4" /> : null}
    </>
  );

  if (!editable) return <span className={cn(chipCls, "cursor-default")}>{chip}</span>;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="Assignee"
        onClick={() => setOpen((o) => !o)}
        className={cn(chipCls, "hover:bg-bg-hover hover:text-fg-1")}
      >
        {chip}
      </button>
      {open ? (
        <div className="pm-fade-in-up absolute right-0 top-full z-[var(--z-dropdown)] mt-1 w-64 rounded-[var(--radius-md)] border bg-popover p-1 shadow-[var(--shadow-lg)]">
          <div className="flex items-center gap-1.5 px-1.5 py-1">
            <Search className="size-3.5 text-fg-4" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search members…"
              className="h-6 w-full bg-transparent text-[12px] text-fg-1 placeholder:text-fg-4 focus:outline-none"
            />
          </div>
          <div className="my-1 h-px bg-border" />
          <div className="max-h-56 overflow-y-auto">
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-[12px] text-fg-2 hover:bg-bg-hover"
            >
              <User className="size-3.5 text-fg-4" />
              Unassigned
              {value === null ? <Check className="ml-auto size-3.5 text-fg-3" /> : null}
            </button>
            {loading ? (
              <p className="px-2 py-2 text-[12px] text-fg-3">Loading…</p>
            ) : null}
            {!loading &&
              members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    onChange({
                      id: m.id,
                      name: m.name,
                      email: m.email,
                      image: m.image,
                    });
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-[12px] text-fg-1 hover:bg-bg-hover"
                >
                  <Initial name={m.name ?? m.email} />
                  <span className="min-w-0 flex-1 truncate">{m.name ?? m.email}</span>
                  {value?.id === m.id ? (
                    <Check className="size-3.5 text-fg-3" />
                  ) : null}
                </button>
              ))}
            {!loading && members.length === 0 ? (
              <p className="px-2 py-2 text-[12px] text-fg-3">No members found.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Initial({ name }: { name: string }) {
  const ch = name.trim()[0]?.toUpperCase() ?? "?";
  return (
    <span className="flex size-4 shrink-0 items-center justify-center rounded-[var(--radius-full)] bg-bg-active text-[9px] font-semibold text-fg-2">
      {ch}
    </span>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
