"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { EpicStatus } from "@prisma/client";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DEFAULT_EPIC_COLOR,
  EPIC_COLOR_PALETTE,
  EPIC_STATUS_LABELS,
  EPIC_STATUS_ORDER,
  type EpicCore,
  type EpicSummary,
} from "@/lib/agile";
import { cn } from "@/lib/utils";

const inputCls =
  "w-full rounded-[var(--radius-md)] border bg-background px-3 text-[13px] text-fg-1 placeholder:text-fg-4 focus:border-ring focus:outline-none focus-visible:shadow-[var(--shadow-focus)]";

export interface EpicDialogInitial {
  id: string;
  name: string;
  description: string | null;
  color: string;
  status: EpicStatus;
}

interface Props {
  workspaceId: string;
  mode: "create" | "edit";
  initial?: EpicDialogInitial;
  /** Preselected status for create (e.g. the column the user clicked "+"). */
  defaultStatus?: EpicStatus;
  onClose: () => void;
  onCreated?: (epic: EpicSummary) => void;
  onUpdated?: (epic: EpicCore) => void;
  onArchived?: (id: string) => void;
}

export function EpicDialog({
  workspaceId,
  mode,
  initial,
  defaultStatus,
  onClose,
  onCreated,
  onUpdated,
  onArchived,
}: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [color, setColor] = useState(initial?.color ?? DEFAULT_EPIC_COLOR);
  const [status, setStatus] = useState<EpicStatus>(
    initial?.status ?? defaultStatus ?? EpicStatus.PLANNED,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const url =
        mode === "create"
          ? `/api/workspaces/${workspaceId}/epics`
          : `/api/workspaces/${workspaceId}/epics/${initial!.id}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, color, status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn’t save the epic.");
      if (mode === "create") onCreated?.(data.epic as EpicSummary);
      else onUpdated?.(data.epic as EpicCore);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  async function archive() {
    if (!initial) return;
    if (!confirm("Archive this epic? It will be removed from the board.")) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/epics/${initial.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      });
      if (!res.ok) {
        throw new Error(
          (await res.json().catch(() => ({}))).error ?? "Couldn’t archive.",
        );
      }
      onArchived?.(initial.id);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4">
      <div className="pm-fade-in absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === "create" ? "New epic" : "Edit epic"}
        className="pm-pop-in relative w-full max-w-md rounded-[var(--radius-xl)] border bg-background p-5 shadow-[var(--shadow-xl)]"
      >
        <div className="flex items-center justify-between">
          <h2 className="t-h3">{mode === "create" ? "New epic" : "Edit epic"}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-[var(--radius-sm)] text-fg-3 hover:bg-bg-hover hover:text-fg-1"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <Field label="Name">
            <input
              autoFocus
              aria-label="Epic name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Checkout 2.0"
              maxLength={120}
              className={cn(inputCls, "h-9")}
            />
          </Field>

          <Field label="Description">
            <textarea
              aria-label="Epic description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional summary of the epic"
              rows={3}
              className={cn(inputCls, "resize-none py-2 leading-[20px]")}
            />
          </Field>

          <Field label="Status">
            <div className="inline-flex items-center gap-px rounded-[var(--radius-md)] border bg-bg-subtle p-0.5">
              {EPIC_STATUS_ORDER.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={cn(
                    "rounded-[var(--radius-sm)] px-2.5 py-1 text-[12px] font-medium transition-colors",
                    status === s
                      ? "bg-background text-fg-1 shadow-[var(--shadow-xs)]"
                      : "text-fg-3 hover:text-fg-1",
                  )}
                >
                  {EPIC_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Color">
            <div className="flex flex-wrap gap-2">
              {EPIC_COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  aria-pressed={color === c}
                  onClick={() => setColor(c)}
                  style={{ backgroundColor: c }}
                  className={cn(
                    "size-6 rounded-[var(--radius-full)] ring-offset-2 ring-offset-background transition-shadow",
                    color === c && "ring-2 ring-fg-1",
                  )}
                />
              ))}
            </div>
          </Field>
        </div>

        {error ? (
          <p className="mt-3 text-[12px] text-destructive">{error}</p>
        ) : null}

        <div className="mt-5 flex items-center justify-between gap-2">
          {mode === "edit" ? (
            <Button
              variant="ghost"
              onClick={archive}
              disabled={saving}
              className="text-destructive hover:text-destructive"
            >
              Archive
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || !name.trim()}>
              {saving ? "Saving…" : mode === "create" ? "Create" : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  // A div (not <label>) since some fields contain button groups, which a
  // wrapping <label> would mis-associate with.
  return (
    <div>
      <span className="t-label mb-1.5 block">{label}</span>
      {children}
    </div>
  );
}
