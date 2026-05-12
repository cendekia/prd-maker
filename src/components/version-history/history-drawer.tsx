"use client";

import { useCallback, useEffect, useState } from "react";
import { History as HistoryIcon, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { DiffView } from "./diff-view";
import type { VersionDetail, VersionListItem } from "./types";
import { VersionList } from "./version-list";

interface Props {
  pageId: string;
  /** Live JSON from the editor — the "right side" of the diff. */
  getCurrentJson: () => unknown;
  /** Whether the current user is allowed to restore (EDITOR or OWNER). */
  canRestore: boolean;
  /** Called after a successful restore so the editor can re-apply the
   *  returned snapshot (which then propagates via Yjs to other clients). */
  onRestored: (snapshotJson: unknown) => void;
  onClose: () => void;
  className?: string;
}

export function HistoryDrawer({
  pageId,
  getCurrentJson,
  canRestore,
  onRestored,
  onClose,
  className,
}: Props) {
  const [versions, setVersions] = useState<VersionListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<VersionDetail | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetchList = useCallback(async () => {
    try {
      const res = await fetch(`/api/pages/${pageId}/versions`);
      if (!res.ok) {
        setError(`Failed to load history (${res.status})`);
        return;
      }
      const data = (await res.json()) as { versions: VersionListItem[] };
      setVersions(data.versions);
      if (data.versions.length > 0 && !selectedId) {
        setSelectedId(data.versions[0].id);
      }
    } finally {
      setListLoading(false);
    }
  }, [pageId, selectedId]);

  useEffect(() => {
    refetchList();
  }, [refetchList]);

  // Load the selected version's snapshot JSON.
  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      return;
    }
    let cancelled = false;
    setSelectedLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/pages/${pageId}/versions/${selectedId}`);
        if (!res.ok) {
          if (!cancelled) setError(`Failed to load version (${res.status})`);
          return;
        }
        const data = (await res.json()) as VersionDetail;
        if (!cancelled) {
          setSelected(data);
          setError(null);
        }
      } finally {
        if (!cancelled) setSelectedLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pageId, selectedId]);

  async function handleRestore() {
    if (!selectedId || restoring) return;
    setRestoring(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/pages/${pageId}/versions/${selectedId}/restore`,
        { method: "POST" },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Restore failed (${res.status})`);
      }
      const data = (await res.json()) as { snapshotJson: unknown };
      onRestored(data.snapshotJson);
      // Refresh list so the safety snapshot we just took shows up.
      await refetchList();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRestoring(false);
    }
  }

  const currentJson = selected ? getCurrentJson() : null;

  return (
    <aside
      className={cn(
        "flex w-full max-w-[920px] shrink-0 flex-col border-l bg-bg-subtle",
        className,
      )}
      aria-label="Version history"
    >
      <header className="flex h-[var(--topbar-height)] items-center gap-2 border-b bg-background px-3">
        <HistoryIcon className="size-4 text-fg-3" />
        <span className="text-[13px] font-medium text-fg-1">Version history</span>
        <span className="text-[11px] text-fg-3">{versions.length}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close history"
          onClick={onClose}
          className="ml-auto"
        >
          <X className="size-4" />
        </Button>
      </header>

      <div className="flex flex-1 min-h-0">
        <div className="flex w-[260px] shrink-0 flex-col overflow-y-auto border-r bg-background">
          <VersionList
            versions={versions}
            selectedId={selectedId}
            onSelect={setSelectedId}
            loading={listLoading}
          />
        </div>
        <div className="flex flex-1 min-w-0 flex-col">
          <div className="flex items-center gap-2 border-b bg-background px-3 py-2">
            <div className="flex-1 truncate text-[12px] text-fg-3">
              {selected
                ? `Showing ${formatLabel(selected)} vs current`
                : "Select a version to compare"}
            </div>
            {selected && canRestore ? (
              <Button
                size="sm"
                variant="default"
                disabled={restoring}
                onClick={handleRestore}
              >
                <RotateCcw className="size-3.5" />
                {restoring ? "Restoring…" : "Restore this version"}
              </Button>
            ) : null}
          </div>
          {error ? (
            <div className="border-b bg-[oklch(0.577_0.245_27.325_/_0.08)] px-3 py-2 text-[12px] text-destructive">
              {error}
            </div>
          ) : null}
          <div className="flex-1 min-h-0 overflow-hidden bg-background">
            {selectedLoading ? (
              <div className="px-3 py-4 text-[12px] text-fg-3">Loading diff…</div>
            ) : selected ? (
              <DiffView
                leftJson={selected.snapshotJson}
                rightJson={currentJson}
                leftLabel={formatLabel(selected)}
                rightLabel="Current"
              />
            ) : null}
          </div>
        </div>
      </div>
    </aside>
  );
}

function formatLabel(v: VersionDetail | VersionListItem): string {
  const when = new Date(v.createdAt).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const who = v.createdBy.name ?? v.createdBy.email;
  return `${when} · ${who}`;
}
