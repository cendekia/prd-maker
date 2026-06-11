"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Sparkles, Workflow } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { FeatureNode, WorkspaceGraph } from "@/lib/agent/types";
import { cn } from "@/lib/utils";

import { FeatureDetail } from "./feature-detail";
import { FeatureDialog, type FeatureDialogState } from "./feature-dialog";
import { FeaturesList } from "./features-list";

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
  initialTab: string | null;
  initialFeatureId: string | null;
  canEdit: boolean;
  canDelete: boolean;
}

export function FeaturesSurface({
  workspaceId,
  workspaceSlug,
  initialGraph,
  initialTab,
  initialFeatureId,
  canEdit,
  canDelete,
}: Props) {
  const router = useRouter();
  const [graph, setGraph] = useState(initialGraph);
  const [tab, setTab] = useState<Tab>(parseTab(initialTab));
  const [selectedId, setSelectedId] = useState<string | null>(initialFeatureId);
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
                  "rounded-[var(--radius-sm)] px-2.5 py-1 text-[12px] font-medium transition-colors",
                  tab === t.id
                    ? "bg-background text-fg-1 shadow-[var(--shadow-xs)]"
                    : "text-fg-3 hover:text-fg-1",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          {canEdit ? (
            <Button
              size="sm"
              onClick={() => setDialog({ mode: "create", stackId: null })}
              disabled={!hasStacks}
              title={hasStacks ? undefined : "Set up stacks first"}
            >
              <Plus />
              New feature
            </Button>
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
          <StubPanel
            icon={<Workflow className="mx-auto size-8 text-fg-4" />}
            title="Mind map"
            body="The interactive feature map (React Flow) lands in Step 51. The graph you curate here will render as stack-colored nodes with typed edges."
          />
        ) : (
          <StubPanel
            icon={<Sparkles className="mx-auto size-8 text-fg-4" />}
            title="Agent suggestions"
            body="Once extraction lands (Steps 49–50), features and links the agent finds in your PRDs queue here for review before joining the canonical graph."
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

function StubPanel({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="px-6 py-10">
      <div className="mx-auto max-w-md rounded-[var(--radius-xl)] border border-dashed px-6 py-10 text-center">
        {icon}
        <h2 className="t-h3 mt-3">{title}</h2>
        <p className="mt-1.5 text-[13px] leading-[20px] text-fg-3">{body}</p>
      </div>
    </div>
  );
}
