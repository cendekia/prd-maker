"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FilePlus, FileText, X } from "lucide-react";

interface TemplateItem {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
}

interface Props {
  workspaceId: string;
  /**
   * "create" (default): pick a template — or blank — for a new page.
   * "apply" (Step 62): pour a template into the current empty page. The
   * Blank option is hidden because there's nothing to create.
   */
  mode?: "create" | "apply";
  /** Create a page from the chosen template (null = blank). Resolves once the
   * parent has navigated (or the template is applied); rejects with an error
   * message to show inline. */
  onSelect: (templateId: string | null, title: string) => Promise<void> | void;
  onClose: () => void;
}

export function TemplatePicker({
  workspaceId,
  mode = "create",
  onSelect,
  onClose,
}: Props) {
  const isApply = mode === "apply";
  const [templates, setTemplates] = useState<TemplateItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/templates`);
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error ?? "Couldn’t load templates.");
        if (alive) setTemplates(d.templates ?? []);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [workspaceId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  async function choose(templateId: string | null, title: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSelect(templateId, title);
      // On success the parent navigates to the new page and unmounts us.
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const system = (templates ?? []).filter((t) => t.isSystem);
  const custom = (templates ?? []).filter((t) => !t.isSystem);

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-start justify-center overflow-y-auto p-4 sm:p-10">
      <div
        className="pm-fade-in absolute inset-0 bg-black/40"
        onClick={() => !busy && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isApply ? "Apply a template" : "New page"}
        className="pm-pop-in relative w-full max-w-lg rounded-[var(--radius-xl)] border bg-background p-5 shadow-[var(--shadow-xl)]"
      >
        <div className="flex items-center justify-between">
          <h2 className="t-h3">{isApply ? "Apply a template" : "New page"}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={() => !busy && onClose()}
            className="flex size-7 items-center justify-center rounded-[var(--radius-sm)] text-fg-3 hover:bg-bg-hover hover:text-fg-1"
          >
            <X className="size-4" />
          </button>
        </div>

        {!isApply ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => choose(null, "Untitled")}
            className="mt-4 flex w-full items-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-border-strong p-3 text-left transition-colors hover:bg-bg-hover disabled:opacity-50"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-bg-subtle text-fg-3">
              <FilePlus className="size-4" />
            </span>
            <span>
              <span className="block text-[14px] font-medium text-fg-1">Blank page</span>
              <span className="block text-[12px] text-fg-3">Start from scratch</span>
            </span>
          </button>
        ) : null}

        {error ? <p className="mt-3 text-[12px] text-destructive">{error}</p> : null}

        {templates === null && !error ? (
          <p className="mt-4 text-[13px] text-fg-3">Loading templates…</p>
        ) : null}

        {system.length > 0 ? (
          <>
            <p className="t-label mb-2 mt-5">Templates</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {system.map((t) => (
                <TemplateCard
                  key={t.id}
                  t={t}
                  disabled={busy}
                  onClick={() => choose(t.id, t.name)}
                />
              ))}
            </div>
          </>
        ) : null}

        {custom.length > 0 ? (
          <>
            <p className="t-label mb-2 mt-5">Workspace templates</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {custom.map((t) => (
                <TemplateCard
                  key={t.id}
                  t={t}
                  disabled={busy}
                  onClick={() => choose(t.id, t.name)}
                />
              ))}
            </div>
          </>
        ) : null}

        {busy ? (
          <p className="mt-4 text-[12px] text-fg-3">
            {isApply ? "Applying template…" : "Creating page…"}
          </p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

function TemplateCard({
  t,
  onClick,
  disabled,
}: {
  t: TemplateItem;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-border p-3 text-left transition-colors hover:border-border-strong hover:bg-bg-hover disabled:opacity-50"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-bg-subtle text-brand-500">
        <FileText className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-medium text-fg-1">
          {t.name}
        </span>
        {t.description ? (
          <span className="mt-0.5 line-clamp-2 block text-[12px] leading-[16px] text-fg-3">
            {t.description}
          </span>
        ) : null}
      </span>
    </button>
  );
}
