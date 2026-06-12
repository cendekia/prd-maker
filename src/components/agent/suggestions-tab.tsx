"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { FeatureLinkKind, PageFeatureRole } from "@prisma/client";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  FEATURE_LINK_KIND_LABELS,
  FEATURE_LINK_KIND_ORDER,
  PAGE_FEATURE_ROLE_LABELS,
  PAGE_FEATURE_ROLE_ORDER,
  type FeatureNode,
  type StackSummary,
  type SuggestedFeatureItem,
  type SuggestionQueue,
} from "@/lib/agent/types";
import { cn } from "@/lib/utils";

import { MergeDialog } from "./merge-dialog";
import { ConfidencePill, SuggestionCard } from "./suggestion-card";

const inputCls =
  "w-full rounded-[var(--radius-md)] border bg-background px-2.5 text-[13px] text-fg-1 placeholder:text-fg-4 focus:border-ring focus:outline-none focus-visible:shadow-[var(--shadow-focus)]";
const selectCls =
  "rounded-[var(--radius-sm)] border bg-background px-1.5 py-0.5 text-[11px] text-fg-2 focus:border-ring focus:outline-none";

interface Props {
  workspaceId: string;
  workspaceSlug: string;
  queue: SuggestionQueue;
  stacks: StackSummary[];
  features: FeatureNode[];
  canEdit: boolean;
  onChanged: () => void;
}

/**
 * The review queue (Step 50) — the human gate between agent suggestions and
 * the canonical graph. Resolved cards hide optimistically; the server
 * re-render (onChanged → router.refresh) trues everything up.
 */
export function SuggestionsTab({
  workspaceId,
  workspaceSlug,
  queue,
  stacks,
  features,
  canEdit,
  onChanged,
}: Props) {
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    id: string;
    name: string;
    summary: string;
  } | null>(null);
  const [kindEdits, setKindEdits] = useState<Record<string, FeatureLinkKind>>({});
  const [roleEdits, setRoleEdits] = useState<Record<string, PageFeatureRole>>({});
  const [mergeSource, setMergeSource] = useState<SuggestedFeatureItem | null>(
    null,
  );

  // Fresh server data arrived — drop the optimistic hide-list.
  useEffect(() => setResolved(new Set()), [queue]);

  const stackById = useMemo(
    () => new Map(stacks.map((s) => [s.id, s])),
    [stacks],
  );

  const visibleFeatures = queue.features.filter((f) => !resolved.has(f.id));
  const visibleLinks = queue.links.filter((l) => !resolved.has(l.id));
  const visiblePageLinks = queue.pageLinks.filter((p) => !resolved.has(p.id));
  const total =
    visibleFeatures.length + visibleLinks.length + visiblePageLinks.length;

  async function post(body: unknown): Promise<void> {
    const res = await fetch(
      `/api/workspaces/${workspaceId}/agent/suggestions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Couldn’t resolve the suggestion.");
    }
  }

  async function resolve(id: string, body: unknown) {
    setBusyId(id);
    setError(null);
    try {
      await post(body);
      setResolved((s) => new Set(s).add(id));
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function bulkAccept(
    target: "feature" | "link" | "pageLink",
    count: number,
    label: string,
  ) {
    if (!confirm(`Accept all ${count} suggested ${label}?`)) return;
    setBusyId(`bulk-${target}`);
    setError(null);
    try {
      await post({ target, action: "bulkAccept" });
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  if (total === 0) {
    return (
      <div className="px-6 py-10">
        <div className="mx-auto max-w-md rounded-[var(--radius-xl)] border border-dashed px-6 py-10 text-center">
          <Sparkles className="mx-auto size-8 text-fg-4" />
          <h2 className="t-h3 mt-3">No pending suggestions</h2>
          <p className="mt-1.5 text-[13px] leading-[20px] text-fg-3">
            Run “Sync from PRDs” or ask the workspace agent to map something —
            its proposals queue here for your review.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-7 px-6 py-5">
      {error ? (
        <p className="rounded-[var(--radius-md)] bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          {error}
        </p>
      ) : null}

      <Section
        title={`Features (${visibleFeatures.length})`}
        onBulk={
          canEdit && visibleFeatures.length > 1
            ? () =>
                bulkAccept("feature", visibleFeatures.length, "features")
            : undefined
        }
        bulkBusy={busyId === "bulk-feature"}
      >
        {visibleFeatures.map((f) => {
          const stack = stackById.get(f.stackId);
          const isEditing = editing?.id === f.id;
          return (
            <SuggestionCard
              key={f.id}
              busy={busyId === f.id}
              actions={
                canEdit ? (
                  isEditing ? (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        disabled={
                          !editing.name.trim() || !editing.summary.trim()
                        }
                        onClick={() =>
                          resolve(f.id, {
                            target: "feature",
                            action: "accept",
                            id: f.id,
                            edits: {
                              name: editing.name,
                              summary: editing.summary,
                            },
                          })
                        }
                      >
                        Accept with edits
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() =>
                          resolve(f.id, {
                            target: "feature",
                            action: "reject",
                            id: f.id,
                          })
                        }
                      >
                        Reject
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setMergeSource(f)}
                      >
                        Merge…
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setEditing({
                            id: f.id,
                            name: f.name,
                            summary: f.summary,
                          })
                        }
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        onClick={() =>
                          resolve(f.id, {
                            target: "feature",
                            action: "accept",
                            id: f.id,
                          })
                        }
                      >
                        Accept
                      </Button>
                    </>
                  )
                ) : undefined
              }
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-[var(--radius-full)]"
                  style={{ backgroundColor: stack?.color ?? "var(--fg-4)" }}
                />
                <span className="text-[11px] text-fg-3">{stack?.name}</span>
              </div>
              {isEditing ? (
                <div className="mt-1.5 space-y-1.5">
                  <input
                    aria-label="Feature name"
                    value={editing.name}
                    maxLength={80}
                    onChange={(e) =>
                      setEditing({ ...editing, name: e.target.value })
                    }
                    className={cn(inputCls, "h-8")}
                  />
                  <textarea
                    aria-label="Feature summary"
                    value={editing.summary}
                    rows={2}
                    onChange={(e) =>
                      setEditing({ ...editing, summary: e.target.value })
                    }
                    className={cn(inputCls, "resize-none py-1.5")}
                  />
                </div>
              ) : (
                <>
                  <p className="mt-1 text-[13px] font-medium text-fg-1">
                    {f.name}
                  </p>
                  <p className="mt-0.5 text-[12px] leading-[18px] text-fg-3">
                    {f.summary}
                  </p>
                </>
              )}
              {f.pages.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {f.pages.map((p) => (
                    <Link
                      key={p.pageId}
                      href={`/${workspaceSlug}/p/${p.pageId}`}
                      className="rounded-[var(--radius-full)] border bg-bg-subtle px-2 py-0.5 text-[11px] text-fg-3 hover:text-fg-1"
                    >
                      from “{p.title}”
                    </Link>
                  ))}
                </div>
              ) : null}
            </SuggestionCard>
          );
        })}
      </Section>

      <Section
        title={`Links (${visibleLinks.length})`}
        onBulk={
          canEdit && visibleLinks.length > 1
            ? () => bulkAccept("link", visibleLinks.length, "links")
            : undefined
        }
        bulkBusy={busyId === "bulk-link"}
      >
        {visibleLinks.map((l) => {
          const kind = kindEdits[l.id] ?? l.kind;
          const activates = [l.from, l.to].filter(
            (e) => e.status === "SUGGESTED",
          );
          return (
            <SuggestionCard
              key={l.id}
              busy={busyId === l.id}
              actions={
                canEdit ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() =>
                        resolve(l.id, {
                          target: "link",
                          action: "reject",
                          id: l.id,
                        })
                      }
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        resolve(l.id, {
                          target: "link",
                          action: "accept",
                          id: l.id,
                          edits: kind !== l.kind ? { kind } : undefined,
                        })
                      }
                    >
                      Accept
                    </Button>
                  </>
                ) : undefined
              }
            >
              <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-fg-1">
                <span className="font-medium">{l.from.name}</span>
                {l.from.status === "SUGGESTED" ? (
                  <span className="text-[11px] text-fg-4">(new)</span>
                ) : null}
                {canEdit ? (
                  <select
                    aria-label="Link kind"
                    value={kind}
                    onChange={(e) =>
                      setKindEdits((k) => ({
                        ...k,
                        [l.id]: e.target.value as FeatureLinkKind,
                      }))
                    }
                    className={selectCls}
                  >
                    {FEATURE_LINK_KIND_ORDER.map((k) => (
                      <option key={k} value={k}>
                        {FEATURE_LINK_KIND_LABELS[k]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-[11px] text-fg-3">
                    {FEATURE_LINK_KIND_LABELS[kind]}
                  </span>
                )}
                <span className="font-medium">{l.to.name}</span>
                {l.to.status === "SUGGESTED" ? (
                  <span className="text-[11px] text-fg-4">(new)</span>
                ) : null}
                <ConfidencePill value={l.confidence} />
              </div>
              {l.rationale ? (
                <p className="mt-1 text-[12px] italic leading-[18px] text-fg-3">
                  {l.rationale}
                </p>
              ) : null}
              {activates.length > 0 ? (
                <p className="mt-1 text-[11px] text-fg-4">
                  Accepting also activates{" "}
                  {activates.map((a) => `“${a.name}”`).join(" and ")}.
                </p>
              ) : null}
            </SuggestionCard>
          );
        })}
      </Section>

      <Section
        title={`PRD connections (${visiblePageLinks.length})`}
        onBulk={
          canEdit && visiblePageLinks.length > 1
            ? () =>
                bulkAccept(
                  "pageLink",
                  visiblePageLinks.length,
                  "PRD connections",
                )
            : undefined
        }
        bulkBusy={busyId === "bulk-pageLink"}
      >
        {visiblePageLinks.map((p) => {
          const role = roleEdits[p.id] ?? p.role;
          return (
            <SuggestionCard
              key={p.id}
              busy={busyId === p.id}
              actions={
                canEdit ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() =>
                        resolve(p.id, {
                          target: "pageLink",
                          action: "reject",
                          id: p.id,
                        })
                      }
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        resolve(p.id, {
                          target: "pageLink",
                          action: "accept",
                          id: p.id,
                          edits: role !== p.role ? { role } : undefined,
                        })
                      }
                    >
                      Accept
                    </Button>
                  </>
                ) : undefined
              }
            >
              <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-fg-1">
                <Link
                  href={`/${workspaceSlug}/p/${p.pageId}`}
                  className="font-medium underline-offset-2 hover:underline"
                >
                  “{p.pageTitle}”
                </Link>
                {canEdit ? (
                  <select
                    aria-label="Connection role"
                    value={role}
                    onChange={(e) =>
                      setRoleEdits((r) => ({
                        ...r,
                        [p.id]: e.target.value as PageFeatureRole,
                      }))
                    }
                    className={selectCls}
                  >
                    {PAGE_FEATURE_ROLE_ORDER.map((r) => (
                      <option key={r} value={r}>
                        {PAGE_FEATURE_ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-[11px] text-fg-3">
                    {PAGE_FEATURE_ROLE_LABELS[role]}
                  </span>
                )}
                <span className="font-medium">{p.featureName}</span>
                {p.featureStatus === "SUGGESTED" ? (
                  <span className="text-[11px] text-fg-4">(new)</span>
                ) : null}
              </div>
            </SuggestionCard>
          );
        })}
      </Section>

      {mergeSource ? (
        <MergeDialog
          workspaceId={workspaceId}
          source={mergeSource}
          features={features}
          stacks={stacks}
          onClose={() => setMergeSource(null)}
          onMerged={() => {
            setResolved((s) => new Set(s).add(mergeSource.id));
            onChanged();
          }}
        />
      ) : null}
    </div>
  );
}

function Section({
  title,
  onBulk,
  bulkBusy,
  children,
}: {
  title: string;
  onBulk?: () => void;
  bulkBusy?: boolean;
  children: ReactNode;
}) {
  const items = Array.isArray(children) ? children : [children];
  const empty =
    items.length === 0 || (Array.isArray(children) && children.length === 0);
  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold text-fg-1">{title}</h2>
        {onBulk ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onBulk}
            disabled={bulkBusy}
          >
            {bulkBusy ? "Accepting…" : "Accept all"}
          </Button>
        ) : null}
      </div>
      {empty ? (
        <p className="mt-2 text-[12px] text-fg-4">Nothing pending.</p>
      ) : (
        <div className="mt-2 space-y-2">{children}</div>
      )}
    </section>
  );
}
