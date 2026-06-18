"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Network, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  FeatureNode,
  SuggestionQueue,
  WorkspaceGraph,
} from "@/lib/agent/types";
import { cn } from "@/lib/utils";

import { AgentEmptyState } from "./agent-empty-state";
import { FeatureDetail } from "./feature-detail";
import { FeatureDialog, type FeatureDialogState } from "./feature-dialog";
import { FeaturesList } from "./features-list";
import { SuggestionsTab } from "./suggestions-tab";
import { SyncButton } from "./sync-button";

// React Flow is browser-only — load the canvas client-side.
const FeatureMap = dynamic(
  () => import("./feature-map").then((m) => m.FeatureMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-[13px] text-fg-3">
        Loading map…
      </div>
    ),
  },
);

type Tab = "list" | "map" | "suggestions";

const TABS: { id: Tab; label: string }[] = [
  { id: "list", label: "List" },
  { id: "map", label: "Map" },
  { id: "suggestions", label: "Suggestions" },
];

function parseTab(v: string | null): Tab {
  return v === "map" || v === "suggestions" ? v : "list";
}

interface Props {
  workspaceId: string;
  workspaceSlug: string;
  initialGraph: WorkspaceGraph;
  initialQueue: SuggestionQueue;
  initialTab: string | null;
  initialFeatureId: string | null;
  canEdit: boolean;
  canDelete: boolean;
  /** Plan gate (Step 53) — server-resolved, never read from config here. */
  agentEnabled: boolean;
}

export function FeaturesSurface({
  workspaceId,
  workspaceSlug,
  initialGraph,
  initialQueue,
  initialTab,
  initialFeatureId,
  canEdit,
  canDelete,
  agentEnabled,
}: Props) {
  const router = useRouter();
  const [graph, setGraph] = useState(initialGraph);
  const [tab, setTab] = useState<Tab>(parseTab(initialTab));
  // A `?feature=` deep link opens the detail sheet — except on the map tab,
  // where it pre-focuses the canvas instead (Step 51).
  const [selectedId, setSelectedId] = useState<string | null>(
    parseTab(initialTab) === "map" ? null : initialFeatureId,
  );
  const [dialog, setDialog] = useState<FeatureDialogState>(null);

  // Server actions / refreshes re-render the page; keep local graph in sync.
  useEffect(() => setGraph(initialGraph), [initialGraph]);

  function switchTab(t: Tab) {
    setTab(t);
    router.replace(`/${workspaceSlug}/features?tab=${t}`, { scroll: false });
  }

  function upsertFeature(feature: FeatureNode) {
    setGraph((g) => {
      const features = feature.archivedAt
        ? g.features.filter((f) => f.id !== feature.id)
        : [
            ...g.features.filter((f) => f.id !== feature.id),
            feature,
          ].sort((a, b) => a.name.localeCompare(b.name));
      return { ...g, features };
    });
    router.refresh();
  }

  function removeFeature(id: string) {
    setGraph((g) => ({
      ...g,
      features: g.features.filter((f) => f.id !== id),
      links: g.links.filter(
        (l) => l.fromFeatureId !== id && l.toFeatureId !== id,
      ),
    }));
    if (selectedId === id) setSelectedId(null);
    router.refresh();
  }

  const hasStacks = graph.stacks.length > 0;
  const pendingCount =
    initialQueue.features.length +
    initialQueue.links.length +
    initialQueue.pageLinks.length;

  // Plan gate (Step 53) — always allowed at launch; flips off if a future
  // plan disables the workspace agent.
  if (!agentEnabled) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <Network className="mb-3 size-8 text-fg-4" />
        <h1 className="t-h2">Workspace agent</h1>
        <p className="mt-2 max-w-md text-[13px] leading-[20px] text-fg-3">
          The feature mind map and impact analysis aren’t available on your
          current plan.
        </p>
        <Button asChild className="mt-4">
          <Link href="/pricing">See plans</Link>
        </Button>
      </div>
    );
  }

  // Onboarding (Step 53): no stacks yet — explain the model before the tabs.
  if (!hasStacks) {
    return (
      <div className="flex h-full flex-col">
        <div className="shrink-0 border-b px-6 py-3">
          <h1 className="text-[15px] font-semibold text-fg-1">Features</h1>
          <p className="text-[12px] text-fg-3">
            The application’s feature mind map, grouped by stack.
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <AgentEmptyState workspaceSlug={workspaceSlug} canEdit={canEdit} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b px-6 py-3">
        <div>
          <h1 className="text-[15px] font-semibold text-fg-1">Features</h1>
          <p className="text-[12px] text-fg-3">
            The application’s feature mind map, grouped by stack.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-px rounded-[var(--radius-md)] border bg-bg-subtle p-0.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => switchTab(t.id)}
                className={cn(
                  "flex items-center gap-1 rounded-[var(--radius-sm)] px-2.5 py-1 text-[12px] font-medium transition-colors",
                  tab === t.id
                    ? "bg-background text-fg-1 shadow-[var(--shadow-xs)]"
                    : "text-fg-3 hover:text-fg-1",
                )}
              >
                {t.label}
                {t.id === "suggestions" && pendingCount > 0 ? (
                  <span className="rounded-[var(--radius-full)] bg-brand-500 px-1.5 py-0.5 text-[10px] font-medium leading-none text-white">
                    {pendingCount}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          {canEdit ? (
            <>
              {hasStacks ? <SyncButton workspaceId={workspaceId} /> : null}
              <Button
                size="sm"
                onClick={() => setDialog({ mode: "create", stackId: null })}
                disabled={!hasStacks}
                title={hasStacks ? undefined : "Set up stacks first"}
              >
                <Plus />
                New feature
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "list" ? (
          <FeaturesList
            workspaceSlug={workspaceSlug}
            graph={graph}
            canEdit={canEdit}
            onSelect={(id) => setSelectedId(id)}
            onNew={(stackId) => setDialog({ mode: "create", stackId })}
          />
        ) : tab === "map" ? (
          <div className="h-full">
            <FeatureMap
              graph={graph}
              initialFocusId={initialFeatureId}
              onSelectFeature={(id) => setSelectedId(id)}
            />
          </div>
        ) : (
          <SuggestionsTab
            workspaceId={workspaceId}
            workspaceSlug={workspaceSlug}
            queue={initialQueue}
            stacks={graph.stacks}
            features={graph.features}
            canEdit={canEdit}
            onChanged={() => router.refresh()}
          />
        )}
      </div>

      {dialog ? (
        <FeatureDialog
          workspaceId={workspaceId}
          stacks={graph.stacks}
          dialog={dialog}
          onClose={() => setDialog(null)}
          onSaved={upsertFeature}
        />
      ) : null}

      {selectedId ? (
        <FeatureDetail
          workspaceId={workspaceId}
          workspaceSlug={workspaceSlug}
          featureId={selectedId}
          stacks={graph.stacks}
          features={graph.features}
          canEdit={canEdit}
          canDelete={canDelete}
          onClose={() => setSelectedId(null)}
          onSelectFeature={(id) => setSelectedId(id)}
          onEdit={(feature) => setDialog({ mode: "edit", feature })}
          onChanged={() => router.refresh()}
          onArchived={upsertFeature}
          onDeleted={removeFeature}
        />
      ) : null}
    </div>
  );
}
