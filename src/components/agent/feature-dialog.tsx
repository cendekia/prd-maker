"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FeatureStatus } from "@prisma/client";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  FEATURE_STATUS_LABELS,
  FEATURE_STATUS_ORDER,
  type FeatureNode,
  type StackSummary,
} from "@/lib/agent/types";
import { cn } from "@/lib/utils";

const inputCls =
  "w-full rounded-[var(--radius-md)] border bg-background px-3 text-[13px] text-fg-1 placeholder:text-fg-4 focus:border-ring focus:outline-none focus-visible:shadow-[var(--shadow-focus)]";

export type FeatureDialogState =
  | { mode: "create"; stackId: string | null }
  | { mode: "edit"; feature: FeatureNode }
  | null;

interface Props {
  workspaceId: string;
  stacks: StackSummary[];
  dialog: NonNullable<FeatureDialogState>;
  onClose: () => void;
  onSaved: (feature: FeatureNode) => void;
}

export function FeatureDialog({
  workspaceId,
  stacks,
  dialog,
  onClose,
  onSaved,
}: Props) {
  const initial = dialog.mode === "edit" ? dialog.feature : null;
  const [name, setName] = useState(initial?.name ?? "");
  const [stackId, setStackId] = useState(
    initial?.stackId ??
      (dialog.mode === "create" ? dialog.stackId : null) ??
      stacks[0]?.id ??
      "",
  );
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [status, setStatus] = useState<FeatureStatus>(
    initial?.status ?? FeatureStatus.ACTIVE,
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
        dialog.mode === "create"
          ? `/api/workspaces/${workspaceId}/features`
          : `/api/workspaces/${workspaceId}/features/${dialog.feature.id}`;
      const body =
        dialog.mode === "create"
          ? { stackId, name, summary }
          : { stackId, name, summary, status };
      const res = await fetch(url, {
        method: dialog.mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn’t save the feature.");
      onSaved(data.feature as FeatureNode);
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
        aria-label={dialog.mode === "create" ? "New feature" : "Edit feature"}
        className="pm-pop-in relative w-full max-w-md rounded-[var(--radius-xl)] border bg-background p-5 shadow-[var(--shadow-xl)]"
      >
        <div className="flex items-center justify-between">
          <h2 className="t-h3">
            {dialog.mode === "create" ? "New feature" : "Edit feature"}
          </h2>
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
              aria-label="Feature name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Login endpoint"
              maxLength={80}
              className={cn(inputCls, "h-9")}
            />
          </Field>

          <Field label="Stack">
            <div className="flex flex-wrap gap-1.5">
              {stacks.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={stackId === s.id}
                  onClick={() => setStackId(s.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-[var(--radius-sm)] border px-2 py-1 text-[12px] font-medium transition-colors",
                    stackId === s.id
                      ? "border-fg-1 bg-bg-muted text-fg-1"
                      : "border-input text-fg-3 hover:text-fg-1",
                  )}
                >
                  <span
                    aria-hidden
                    className="size-2 rounded-[var(--radius-full)]"
                    style={{ backgroundColor: s.color }}
                  />
                  {s.name}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Summary">
            <textarea
              aria-label="Feature summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="One or two sentences — this is what the agent reads about the feature."
              rows={2}
              className={cn(inputCls, "resize-none py-2 leading-[20px]")}
            />
          </Field>

          {dialog.mode === "edit" ? (
            <Field label="Status">
              <div className="inline-flex items-center gap-px rounded-[var(--radius-md)] border bg-bg-subtle p-0.5">
                {FEATURE_STATUS_ORDER.map((s) => (
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
                    {FEATURE_STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </Field>
          ) : null}
        </div>

        {error ? (
          <p className="mt-3 text-[12px] text-destructive">{error}</p>
        ) : null}

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={saving || !name.trim() || !summary.trim() || !stackId}
          >
            {saving ? "Saving…" : dialog.mode === "create" ? "Create" : "Save"}
          </Button>
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
