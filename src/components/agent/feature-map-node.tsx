"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Crosshair } from "lucide-react";

import { MAP_NODE_HEIGHT, MAP_NODE_WIDTH } from "@/lib/agent/layout";
import { STACK_TYPE_BADGES, type StackTypeValue } from "@/lib/agent/types";
import { cn } from "@/lib/utils";

export type FeatureMapNodeData = {
  name: string;
  stackName: string;
  stackColor: string;
  stackType: StackTypeValue;
  suggested: boolean;
  deprecated: boolean;
  pageCount: number;
  onFocus: (id: string) => void;
};

export type FeatureMapNodeType = Node<FeatureMapNodeData, "feature">;

/**
 * Mind-map node (Step 51): stack-colored accent, dashed border while the
 * feature is still an unconfirmed suggestion, and a hover crosshair to enter
 * focus mode on this node's neighborhood.
 */
export function FeatureMapNode({
  id,
  data,
  selected,
}: NodeProps<FeatureMapNodeType>) {
  return (
    <div
      style={{ width: MAP_NODE_WIDTH, minHeight: MAP_NODE_HEIGHT }}
      className={cn(
        "group relative rounded-[var(--radius-md)] border bg-background px-3 py-2 shadow-[var(--shadow-xs)]",
        data.suggested && "border-dashed",
        data.deprecated && "opacity-60",
        selected && "border-brand-500 shadow-[var(--shadow-focus)]",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!size-1.5 !border-none !bg-fg-4"
      />
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-[var(--radius-full)]"
          style={{ backgroundColor: data.stackColor }}
        />
        <span className="truncate text-[10px] uppercase tracking-wide text-fg-4">
          {data.stackName}
        </span>
        <span className="ml-auto rounded-[var(--radius-sm)] border px-1 text-[9px] font-medium text-fg-4">
          {STACK_TYPE_BADGES[data.stackType]}
        </span>
      </div>
      <p className="mt-1 truncate text-[12px] font-medium leading-[16px] text-fg-1">
        {data.name}
      </p>
      <p className="mt-0.5 text-[10px] text-fg-4">
        {data.suggested
          ? "unconfirmed"
          : data.pageCount === 1
            ? "1 PRD"
            : `${data.pageCount} PRDs`}
      </p>

      <button
        type="button"
        title="Focus on this feature's neighborhood"
        aria-label={`Focus on ${data.name}`}
        onClick={(e) => {
          e.stopPropagation();
          data.onFocus(id);
        }}
        className="absolute right-1.5 top-1/2 hidden size-5 -translate-y-1/2 items-center justify-center rounded-[var(--radius-sm)] bg-bg-muted text-fg-3 hover:text-fg-1 group-hover:flex"
      >
        <Crosshair className="size-3" />
      </button>

      <Handle
        type="source"
        position={Position.Right}
        className="!size-1.5 !border-none !bg-fg-4"
      />
    </div>
  );
}
