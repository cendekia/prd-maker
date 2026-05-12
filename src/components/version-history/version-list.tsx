"use client";

import { Bot, History as HistoryIcon, Save } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { VersionListItem } from "./types";

interface Props {
  versions: VersionListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
}

export function VersionList({ versions, selectedId, onSelect, loading }: Props) {
  if (loading) {
    return (
      <div className="px-3 py-4 text-[12px] text-fg-3">Loading versions…</div>
    );
  }
  if (versions.length === 0) {
    return (
      <div className="m-3 rounded-[var(--radius-md)] border border-dashed p-4 text-center text-[12px] text-fg-3">
        No versions yet. Edits create snapshots automatically.
      </div>
    );
  }
  return (
    <ul className="divide-y">
      {versions.map((v) => (
        <li key={v.id}>
          <button
            type="button"
            onClick={() => onSelect(v.id)}
            className={cn(
              "flex w-full items-start gap-2.5 px-3 py-2.5 text-left text-[12px] hover:bg-bg-hover",
              selectedId === v.id && "bg-bg-active",
            )}
          >
            <Avatar
              className="mt-0.5 shrink-0"
              size="sm"
              name={v.createdBy.name ?? v.createdBy.email}
              src={v.createdBy.image}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-medium text-fg-1">
                  {v.createdBy.name ?? v.createdBy.email}
                </span>
                <KindBadge kind={v.kind} />
              </div>
              <div className="mt-0.5 text-[11px] text-fg-3">
                {formatWhen(v.createdAt)}
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function KindBadge({ kind }: { kind: VersionListItem["kind"] }) {
  switch (kind) {
    case "MANUAL":
      return (
        <Badge variant="accentSubtle" className="px-1.5 py-0">
          <Save className="size-3" />
          Manual
        </Badge>
      );
    case "PRE_AI":
      return (
        <Badge variant="info" className="px-1.5 py-0">
          <Bot className="size-3" />
          Pre-AI
        </Badge>
      );
    case "AUTO":
    default:
      return (
        <Badge variant="subtle" className="px-1.5 py-0">
          <HistoryIcon className="size-3" />
          Auto
        </Badge>
      );
  }
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
