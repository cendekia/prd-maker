"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import type { FeatureLinkKind } from "@prisma/client";

import {
  FEATURE_LINK_KIND_COLORS,
  FEATURE_LINK_KIND_LABELS,
} from "@/lib/agent/types";

export type FeatureMapEdgeData = {
  kind: FeatureLinkKind;
  suggested: boolean;
};

export type FeatureMapEdgeType = Edge<FeatureMapEdgeData, "kind">;

/**
 * Mind-map edge (Step 51): stroke colored by link kind (design tokens, so it
 * tracks dark mode), dashed while the link is an unconfirmed suggestion, with
 * a compact kind label riding the curve.
 */
export function FeatureMapEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps<FeatureMapEdgeType>) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  const kind = data?.kind ?? "RELATES_TO";
  const color = FEATURE_LINK_KIND_COLORS[kind];

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: color,
          strokeWidth: 1.5,
          strokeDasharray: data?.suggested ? "5 4" : undefined,
          opacity: 0.85,
        }}
      />
      <EdgeLabelRenderer>
        <span
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            color,
          }}
          className="pointer-events-none absolute rounded-[var(--radius-full)] border bg-background px-1.5 py-0.5 text-[9px] font-medium leading-none"
        >
          {FEATURE_LINK_KIND_LABELS[kind]}
          {data?.suggested ? " ?" : ""}
        </span>
      </EdgeLabelRenderer>
    </>
  );
}
