"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Pencil, X } from "lucide-react";
import type { AgileStatus, EpicStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { AGILE_STATUS_COLORS, AGILE_STATUS_LABELS } from "@/lib/agile";
import type { EpicDialogInitial } from "./epic-dialog";

interface EpicDetailData {
  epic: {
    id: string;
    key: string;
    name: string;
    description: string | null;
    color: string;
    status: EpicStatus;
  };
  pages: { id: string; title: string; agileStatus: AgileStatus }[];
}

interface Props {
  workspaceId: string;
  workspaceSlug: string;
  epicId: string;
  canEdit: boolean;
  onClose: () => void;
  onEdit: (epic: EpicDialogInitial) => void;
}

export function EpicDetail({
  workspaceId,
  workspaceSlug,
  epicId,
  canEdit,
  onClose,
  onEdit,
}: Props) {
  const [data, setData] = useState<EpicDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/epics/${epicId}`);
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error ?? "Couldn’t load epic.");
        if (alive) setData(d as EpicDetailData);
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [workspaceId, epicId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-overlay)]">
      <div className="pm-fade-in absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="pm-slide-in-right absolute right-0 top-0 flex h-full w-[360px] max-w-[90vw] flex-col border-l bg-background shadow-[var(--shadow-xl)]">
        <header className="flex items-start justify-between gap-2 border-b p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-[var(--radius-full)]"
                style={{ backgroundColor: data?.epic.color ?? "var(--fg-4)" }}
              />
              <span className="t-mono text-[11px] text-fg-3">
                {data?.epic.key ?? "…"}
              </span>
            </div>
            <h2 className="mt-1 break-words text-[15px] font-semibold text-fg-1">
              {data?.epic.name ?? "Loading…"}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {canEdit && data ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Edit epic"
                onClick={() => onEdit({ ...data.epic })}
              >
                <Pencil />
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close"
              onClick={onClose}
            >
              <X />
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {data?.epic.description ? (
            <p className="mb-4 text-[13px] leading-[20px] text-fg-2">
              {data.epic.description}
            </p>
          ) : null}

          <p className="t-label mb-2">PRDs ({data?.pages.length ?? 0})</p>

          {loading ? (
            <p className="text-[13px] text-fg-3">Loading…</p>
          ) : error ? (
            <p className="text-[13px] text-destructive">{error}</p>
          ) : data && data.pages.length > 0 ? (
            <ul className="space-y-0.5">
              {data.pages.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/${workspaceSlug}/p/${p.id}`}
                    className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 hover:bg-bg-hover"
                  >
                    <span
                      className="size-1.5 shrink-0 rounded-[var(--radius-full)]"
                      style={{ backgroundColor: AGILE_STATUS_COLORS[p.agileStatus] }}
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-fg-1">
                      {p.title || "Untitled"}
                    </span>
                    <span className="shrink-0 text-[11px] text-fg-3">
                      {AGILE_STATUS_LABELS[p.agileStatus]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-fg-3">No PRDs assigned to this epic yet.</p>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
