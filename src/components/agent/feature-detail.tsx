"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Bot, Pencil, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  FEATURE_LINK_KIND_COLORS,
  FEATURE_LINK_KIND_LABELS,
  FEATURE_STATUS_COLORS,
  FEATURE_STATUS_LABELS,
  PAGE_FEATURE_ROLE_COLORS,
  PAGE_FEATURE_ROLE_LABELS,
  type FeatureDetail as FeatureDetailData,
  type FeatureDetailLink,
  type FeatureNode,
  type StackSummary,
} from "@/lib/agent/types";
import { cn } from "@/lib/utils";

import { LinkEditor } from "./link-editor";

interface Props {
  workspaceId: string;
  workspaceSlug: string;
  featureId: string;
  stacks: StackSummary[];
  features: FeatureNode[];
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  onSelectFeature: (featureId: string) => void;
  onEdit: (feature: FeatureNode) => void;
  onChanged: () => void;
  onArchived: (feature: FeatureNode) => void;
  onDeleted: (featureId: string) => void;
}

export function FeatureDetail({
  workspaceId,
  workspaceSlug,
  featureId,
  stacks,
  features,
  canEdit,
  canDelete,
  onClose,
  onSelectFeature,
  onEdit,
  onChanged,
  onArchived,
  onDeleted,
}: Props) {
  const [data, setData] = useState<FeatureDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [addingLink, setAddingLink] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/features/${featureId}`,
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Couldn’t load the feature.");
      setData(d as FeatureDetailData);
      setSummaryDraft((d as FeatureDetailData).feature.summary);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, featureId]);

  useEffect(() => {
    setLoading(true);
    setData(null);
    setAddingLink(false);
    void load();
  }, [load]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function saveSummary() {
    if (!data || summaryDraft.trim() === data.feature.summary) return;
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/features/${featureId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ summary: summaryDraft }),
        },
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Couldn’t save the summary.");
      setData({ ...data, feature: d.feature as FeatureNode });
      setSummaryDraft((d.feature as FeatureNode).summary);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
      setSummaryDraft(data.feature.summary);
    }
  }

  async function removeLink(linkId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/feature-links/${linkId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        throw new Error(
          (await res.json().catch(() => ({}))).error ??
            "Couldn’t remove the link.",
        );
      }
      await load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/features/${featureId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ archived: true }),
        },
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Couldn’t archive.");
      onArchived(d.feature as FeatureNode);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function remove() {
    if (!data) return;
    if (
      !confirm(
        `Delete “${data.feature.name}”? Its links and PRD connections are removed too. This can’t be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/features/${featureId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        throw new Error(
          (await res.json().catch(() => ({}))).error ?? "Couldn’t delete.",
        );
      }
      onDeleted(featureId);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const stack = stacks.find((s) => s.id === data?.feature.stackId);
  const outgoing = (data?.links ?? []).filter(
    (l) => l.fromFeatureId === featureId,
  );
  const incoming = (data?.links ?? []).filter(
    (l) => l.toFeatureId === featureId,
  );

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-overlay)]">
      <div
        className="pm-fade-in absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <aside className="pm-slide-in-right absolute right-0 top-0 flex h-full w-[400px] max-w-[90vw] flex-col border-l bg-background shadow-[var(--shadow-xl)]">
        <header className="flex items-start justify-between gap-2 border-b p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-[var(--radius-full)]"
                style={{ backgroundColor: stack?.color ?? "var(--fg-4)" }}
              />
              <span className="truncate text-[11px] text-fg-3">
                {stack?.name ?? "…"}
              </span>
              {data ? (
                <span
                  className="flex items-center gap-1 text-[11px]"
                  style={{ color: FEATURE_STATUS_COLORS[data.feature.status] }}
                >
                  ● {FEATURE_STATUS_LABELS[data.feature.status]}
                </span>
              ) : null}
              {data?.feature.origin === "AGENT" ? (
                <Bot className="size-3 text-fg-4" aria-label="Agent-created" />
              ) : null}
            </div>
            <h2 className="mt-1 break-words text-[15px] font-semibold text-fg-1">
              {data?.feature.name ?? "Loading…"}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {canEdit && data ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Edit feature"
                onClick={() => onEdit(data.feature)}
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
          {error ? (
            <p className="mb-3 text-[12px] text-destructive">{error}</p>
          ) : null}

          {loading ? (
            <p className="text-[13px] text-fg-3">Loading…</p>
          ) : data ? (
            <>
              <p className="t-label mb-1.5">Summary</p>
              <textarea
                aria-label="Feature summary"
                value={summaryDraft}
                readOnly={!canEdit}
                onChange={(e) => setSummaryDraft(e.target.value)}
                onBlur={saveSummary}
                rows={3}
                className={cn(
                  "w-full resize-none rounded-[var(--radius-md)] border bg-background px-3 py-2 text-[13px] leading-[20px] text-fg-1",
                  canEdit
                    ? "focus:border-ring focus:outline-none focus-visible:shadow-[var(--shadow-focus)]"
                    : "border-transparent px-0 py-0",
                )}
              />

              <div className="mt-5 flex items-center justify-between">
                <p className="t-label">Links ({data.links.length})</p>
                {canEdit && !addingLink ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAddingLink(true)}
                  >
                    <Plus />
                    Add link
                  </Button>
                ) : null}
              </div>

              {addingLink ? (
                <div className="mt-2">
                  <LinkEditor
                    workspaceId={workspaceId}
                    source={data.feature}
                    features={features}
                    stacks={stacks}
                    onCreated={async () => {
                      setAddingLink(false);
                      await load();
                      onChanged();
                    }}
                    onCancel={() => setAddingLink(false)}
                  />
                </div>
              ) : null}

              {data.links.length === 0 && !addingLink ? (
                <p className="mt-2 text-[13px] text-fg-3">
                  Not linked to any feature yet.
                </p>
              ) : (
                <div className="mt-2 space-y-3">
                  <LinkGroup
                    title="Outgoing"
                    icon={<ArrowUpRight className="size-3 text-fg-4" />}
                    links={outgoing}
                    side="to"
                    canEdit={canEdit}
                    busy={busy}
                    onSelectFeature={onSelectFeature}
                    onRemove={removeLink}
                  />
                  <LinkGroup
                    title="Incoming"
                    icon={<ArrowDownLeft className="size-3 text-fg-4" />}
                    links={incoming}
                    side="from"
                    canEdit={canEdit}
                    busy={busy}
                    onSelectFeature={onSelectFeature}
                    onRemove={removeLink}
                  />
                </div>
              )}

              <p className="t-label mb-2 mt-5">PRDs ({data.pages.length})</p>
              {data.pages.length > 0 ? (
                <ul className="space-y-0.5">
                  {data.pages.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/${workspaceSlug}/p/${p.pageId}`}
                        className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 hover:bg-bg-hover"
                      >
                        <span
                          className="shrink-0 text-[11px] font-medium"
                          style={{ color: PAGE_FEATURE_ROLE_COLORS[p.role] }}
                        >
                          {PAGE_FEATURE_ROLE_LABELS[p.role]}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] text-fg-1">
                          {p.title}
                        </span>
                        {p.status === "SUGGESTED" ? (
                          <span className="shrink-0 text-[11px] text-fg-4">
                            suggested
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-fg-3">
                  No PRDs connected yet. Connect them from a PRD’s properties
                  bar (Step 52) or via agent sync (Step 49).
                </p>
              )}

              {canEdit || canDelete ? (
                <div className="mt-6 flex items-center gap-2 border-t pt-4">
                  {canEdit ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={archive}
                      disabled={busy}
                    >
                      Archive
                    </Button>
                  ) : null}
                  {canDelete ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={remove}
                      disabled={busy}
                      className="text-destructive hover:text-destructive"
                    >
                      Delete
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </aside>
    </div>,
    document.body,
  );
}

function LinkGroup({
  title,
  icon,
  links,
  side,
  canEdit,
  busy,
  onSelectFeature,
  onRemove,
}: {
  title: string;
  icon: React.ReactNode;
  links: FeatureDetailLink[];
  /** Which endpoint is the "other" feature for this group. */
  side: "from" | "to";
  canEdit: boolean;
  busy: boolean;
  onSelectFeature: (id: string) => void;
  onRemove: (linkId: string) => void;
}) {
  if (links.length === 0) return null;
  return (
    <div>
      <p className="mb-1 flex items-center gap-1 text-[11px] font-medium text-fg-3">
        {icon}
        {title}
      </p>
      <ul className="space-y-1">
        {links.map((l) => {
          const other = side === "to" ? l.toFeature : l.fromFeature;
          return (
            <li
              key={l.id}
              className={cn(
                "flex items-center gap-2 rounded-[var(--radius-md)] border px-2.5 py-1.5",
                l.status === "SUGGESTED" && "border-dashed",
              )}
            >
              <span
                className="shrink-0 text-[11px] font-medium"
                style={{ color: FEATURE_LINK_KIND_COLORS[l.kind] }}
                title={l.rationale ?? undefined}
              >
                {FEATURE_LINK_KIND_LABELS[l.kind]}
              </span>
              <button
                type="button"
                onClick={() => onSelectFeature(other.id)}
                className="min-w-0 flex-1 truncate text-left text-[13px] text-fg-1 underline-offset-2 hover:underline"
              >
                {other.name}
              </button>
              {l.status === "SUGGESTED" ? (
                <span className="shrink-0 text-[11px] text-fg-4">
                  suggested
                </span>
              ) : null}
              {canEdit ? (
                <button
                  type="button"
                  aria-label="Remove link"
                  disabled={busy}
                  onClick={() => onRemove(l.id)}
                  className="shrink-0 text-fg-4 hover:text-destructive disabled:opacity-50"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
