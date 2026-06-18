"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  FEATURE_LINK_KIND_ORDER,
  STACK_TYPE_ORDER,
  type FeatureImportSummary,
} from "@/lib/agent/types";

const PLACEHOLDER = `{
  "stacks": [
    { "name": "Frontend", "type": "FRONTEND", "features": [
      { "name": "Login form", "summary": "Email + password sign-in." }
    ]},
    { "name": "API", "type": "API", "features": [
      { "name": "Login endpoint", "summary": "POST /auth/login." }
    ]}
  ],
  "links": [
    { "from": "Login form", "to": "Login endpoint", "kind": "CONSUMES" }
  ]
}`;

interface Props {
  workspaceId: string;
  onClose: () => void;
  onImported: () => void;
}

/**
 * Bulk feature-catalog import (Step 56). Paste or upload JSON; the server
 * validates and applies it canonically. Shows the summary, or precise issues.
 * OWNER + Dev Lead only — the surface only mounts this when `canImport`.
 */
export function ImportDialog({
  workspaceId,
  onClose,
  onImported,
}: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState<string[] | null>(null);
  const [summary, setSummary] = useState<FeatureImportSummary | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setText(await file.text());
    setIssues(null);
    setSummary(null);
  }

  async function run() {
    setIssues(null);
    setSummary(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      setIssues([`Not valid JSON: ${(err as Error).message}`]);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/features/import`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setIssues(
          data.issues ?? [data.error ?? "Import failed."],
        );
        return;
      }
      setSummary(data.summary as FeatureImportSummary);
      onImported();
    } catch {
      setIssues(["Couldn't reach the server. Try again."]);
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4">
      <div className="pm-fade-in absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Import features"
        className="pm-pop-in relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-[var(--radius-xl)] border bg-background p-5 shadow-[var(--shadow-xl)]"
      >
        <div className="flex items-center justify-between">
          <h2 className="t-h3">Import features from JSON</h2>
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
          Maps features onto each stack and wires the links between them.
          Imported entries are added directly (no review). Missing stacks are
          created; re-importing is safe (existing features and links aren’t
          duplicated).
        </p>

        {summary ? (
          <ImportSummaryView
            summary={summary}
            onClose={onClose}
            onAgain={() => {
              setSummary(null);
              setText("");
            }}
          />
        ) : (
          <>
            <textarea
              aria-label="Feature JSON"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={PLACEHOLDER}
              spellCheck={false}
              className="mt-3 h-64 w-full resize-none rounded-[var(--radius-md)] border bg-bg-subtle p-3 font-mono text-[12px] leading-[18px] text-fg-1 placeholder:text-fg-4 focus:border-ring focus:outline-none focus-visible:shadow-[var(--shadow-focus)]"
            />
            <p className="mt-1.5 text-[11px] text-fg-4">
              Stack types: {STACK_TYPE_ORDER.join(", ")}. Link kinds:{" "}
              {FEATURE_LINK_KIND_ORDER.join(", ")}.
            </p>

            {issues ? (
              <div className="mt-2 max-h-32 overflow-y-auto rounded-[var(--radius-md)] border border-dashed bg-destructive/5 p-2">
                {issues.map((msg, i) => (
                  <p key={i} className="text-[12px] text-destructive">
                    {msg}
                  </p>
                ))}
              </div>
            ) : null}

            <div className="mt-4 flex items-center justify-between gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                onChange={onFile}
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
              >
                <Upload />
                Upload .json
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={onClose} disabled={busy}>
                  Cancel
                </Button>
                <Button onClick={run} disabled={busy || !text.trim()}>
                  {busy ? "Importing…" : "Import"}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function ImportSummaryView({
  summary,
  onClose,
  onAgain,
}: {
  summary: FeatureImportSummary;
  onClose: () => void;
  onAgain: () => void;
}) {
  const stat = (n: number, label: string) => (
    <div className="rounded-[var(--radius-md)] border bg-background px-3 py-2 text-center">
      <p className="text-[18px] font-semibold text-fg-1">{n}</p>
      <p className="text-[11px] text-fg-3">{label}</p>
    </div>
  );
  return (
    <div className="mt-3">
      <div className="grid grid-cols-3 gap-2">
        {stat(summary.stacksCreated, "stacks created")}
        {stat(summary.featuresCreated, "features created")}
        {stat(summary.featuresReused, "features reused")}
        {stat(summary.linksCreated, "links added")}
        {stat(summary.linksSkipped, "links skipped")}
        {stat(summary.errors.length, "warnings")}
      </div>

      {summary.errors.length > 0 ? (
        <div className="mt-3 max-h-40 overflow-y-auto rounded-[var(--radius-md)] border border-dashed bg-bg-subtle p-2">
          {summary.errors.map((msg, i) => (
            <p key={i} className="text-[12px] text-fg-3">
              {msg}
            </p>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-end gap-2">
        <Button variant="outline" onClick={onAgain}>
          Import more
        </Button>
        <Button onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}
