"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTheme } from "next-themes";
import { Search, X } from "lucide-react";

import { layoutGraph } from "@/lib/agent/layout";
import {
  FEATURE_LINK_KIND_COLORS,
  type WorkspaceGraph,
} from "@/lib/agent/types";
import { cn } from "@/lib/utils";

import {
  FeatureMapEdge,
  type FeatureMapEdgeType,
} from "./feature-map-edge";
import {
  FeatureMapNode,
  type FeatureMapNodeType,
} from "./feature-map-node";

const nodeTypes = { feature: FeatureMapNode };
const edgeTypes = { kind: FeatureMapEdge };

/** Hops included around the focused feature. */
const FOCUS_DEPTH = 2;

interface Props {
  graph: WorkspaceGraph;
  /** Deep-link target (`?feature=`) — pre-focuses its neighborhood. */
  initialFocusId: string | null;
  onSelectFeature: (featureId: string) => void;
}

/**
 * The workspace mind map (Step 51): React Flow canvas over the curated graph.
 * Read-only in v1 — clicking a node opens the detail sheet, the crosshair on
 * a node enters focus mode (its n-hop neighborhood), and the chips double as
 * a stack legend + filter.
 */
export function FeatureMap({ graph, initialFocusId, onSelectFeature }: Props) {
  const { resolvedTheme } = useTheme();
  const [stackFilter, setStackFilter] = useState<Set<string>>(new Set());
  const [hideSuggested, setHideSuggested] = useState(false);
  const [query, setQuery] = useState("");
  const [focusId, setFocusId] = useState<string | null>(
    initialFocusId &&
      graph.features.some((f) => f.id === initialFocusId)
      ? initialFocusId
      : null,
  );

  const toggleStack = useCallback((stackId: string) => {
    setStackFilter((prev) => {
      const next = new Set(prev);
      if (next.has(stackId)) next.delete(stackId);
      else next.add(stackId);
      return next;
    });
  }, []);

  const { nodes, edges, visibleCount } = useMemo(() => {
    // Focus mode: BFS the n-hop neighborhood client-side — the whole graph is
    // already in memory (the server-side `subgraph` query serves Step 52).
    let allowed: Set<string> | null = null;
    if (focusId) {
      allowed = new Set([focusId]);
      let frontier = [focusId];
      for (let hop = 0; hop < FOCUS_DEPTH && frontier.length > 0; hop++) {
        const next: string[] = [];
        for (const link of graph.links) {
          for (const [a, b] of [
            [link.fromFeatureId, link.toFeatureId],
            [link.toFeatureId, link.fromFeatureId],
          ]) {
            if (frontier.includes(a) && !allowed.has(b)) {
              allowed.add(b);
              next.push(b);
            }
          }
        }
        frontier = next;
      }
    }

    const q = query.trim().toLowerCase();
    const stackById = new Map(graph.stacks.map((s) => [s.id, s]));
    const features = graph.features.filter(
      (f) =>
        (!allowed || allowed.has(f.id)) &&
        (stackFilter.size === 0 || stackFilter.has(f.stackId)) &&
        (!hideSuggested || f.status !== "SUGGESTED") &&
        (!q || f.name.toLowerCase().includes(q)),
    );
    const ids = new Set(features.map((f) => f.id));
    const links = graph.links.filter(
      (l) =>
        ids.has(l.fromFeatureId) &&
        ids.has(l.toFeatureId) &&
        (!hideSuggested || l.status !== "SUGGESTED"),
    );

    const positions = layoutGraph({
      nodes: features.map((f) => ({ id: f.id })),
      edges: links.map((l) => ({ from: l.fromFeatureId, to: l.toFeatureId })),
    });

    const rfNodes: FeatureMapNodeType[] = features.map((f) => {
      const stack = stackById.get(f.stackId);
      return {
        id: f.id,
        type: "feature",
        position: positions.get(f.id) ?? { x: 0, y: 0 },
        data: {
          name: f.name,
          stackName: stack?.name ?? "?",
          stackColor: stack?.color ?? "var(--fg-4)",
          stackType: stack?.type ?? "OTHER",
          suggested: f.status === "SUGGESTED",
          deprecated: f.status === "DEPRECATED",
          pageCount: f.pageCount,
          onFocus: (id: string) => setFocusId(id),
        },
        draggable: false,
        connectable: false,
      };
    });
    const rfEdges: FeatureMapEdgeType[] = links.map((l) => ({
      id: l.id,
      source: l.fromFeatureId,
      target: l.toFeatureId,
      type: "kind",
      data: { kind: l.kind, suggested: l.status === "SUGGESTED" },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: FEATURE_LINK_KIND_COLORS[l.kind],
      },
    }));

    return { nodes: rfNodes, edges: rfEdges, visibleCount: features.length };
  }, [graph, focusId, stackFilter, hideSuggested, query]);

  const onNodeClick: NodeMouseHandler = useCallback(
    (_e, node) => onSelectFeature(node.id),
    [onSelectFeature],
  );

  const focusedName = focusId
    ? graph.features.find((f) => f.id === focusId)?.name
    : null;

  return (
    <div className="h-full w-full">
      <ReactFlow
        colorMode={resolvedTheme === "dark" ? "dark" : "light"}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
        minZoom={0.2}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        deleteKeyCode={null}
      >
        <Background gap={20} />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) =>
            (n as FeatureMapNodeType).data.stackColor ?? "var(--fg-4)"
          }
        />

        <Panel
          position="top-left"
          className="flex max-w-[calc(100%-32px)] flex-wrap items-center gap-1.5"
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-fg-4" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              aria-label="Search features on the map"
              className="h-7 w-40 rounded-[var(--radius-md)] border bg-background pl-6.5 pr-2 text-[12px] text-fg-1 placeholder:text-fg-4 focus:border-ring focus:outline-none"
            />
          </div>

          {graph.stacks.map((s) => {
            const active = stackFilter.size === 0 || stackFilter.has(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleStack(s.id)}
                aria-pressed={stackFilter.has(s.id)}
                title={`Toggle ${s.name}`}
                className={cn(
                  "flex items-center gap-1.5 rounded-[var(--radius-full)] border bg-background px-2 py-1 text-[11px] font-medium transition-opacity",
                  active ? "text-fg-1" : "text-fg-4 opacity-50",
                )}
              >
                <span
                  aria-hidden
                  className="size-2 rounded-[var(--radius-full)]"
                  style={{ backgroundColor: s.color }}
                />
                {s.name}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setHideSuggested((v) => !v)}
            aria-pressed={hideSuggested}
            className={cn(
              "rounded-[var(--radius-full)] border bg-background px-2 py-1 text-[11px] font-medium",
              hideSuggested ? "text-fg-1" : "text-fg-3",
            )}
          >
            {hideSuggested ? "Showing confirmed only" : "Hide unconfirmed"}
          </button>

          {focusId ? (
            <span className="flex items-center gap-1 rounded-[var(--radius-full)] border border-brand-500 bg-background px-2 py-1 text-[11px] font-medium text-fg-1">
              Focus: {focusedName ?? "?"} (±{FOCUS_DEPTH})
              <button
                type="button"
                aria-label="Clear focus"
                onClick={() => setFocusId(null)}
                className="text-fg-3 hover:text-fg-1"
              >
                <X className="size-3" />
              </button>
            </span>
          ) : null}

          <span className="text-[11px] text-fg-4">
            {visibleCount} feature{visibleCount === 1 ? "" : "s"}
          </span>
        </Panel>
      </ReactFlow>
    </div>
  );
}
