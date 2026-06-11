"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bot, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  FEATURE_STATUS_COLORS,
  FEATURE_STATUS_LABELS,
  type FeatureNode,
  type WorkspaceGraph,
} from "@/lib/agent/types";

interface Props {
  workspaceSlug: string;
  graph: WorkspaceGraph;
  canEdit: boolean;
  onSelect: (featureId: string) => void;
  onNew: (stackId: string) => void;
}

export function FeaturesList({
  workspaceSlug,
  graph,
  canEdit,
  onSelect,
  onNew,
}: Props) {
  const [query, setQuery] = useState("");

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (f: FeatureNode) =>
      !q ||
      f.name.toLowerCase().includes(q) ||
      f.summary.toLowerCase().includes(q);
    return graph.stacks.map((stack) => ({
      stack,
      features: graph.features.filter(
        (f) => f.stackId === stack.id && matches(f),
      ),
    }));
  }, [graph, query]);

  if (graph.stacks.length === 0) {
    return (
      <div className="px-6 py-10">
        <div className="mx-auto max-w-md rounded-[var(--radius-xl)] border border-dashed px-6 py-10 text-center">
          <h2 className="t-h3">No stacks yet</h2>
          <p className="mt-1.5 text-[13px] leading-[20px] text-fg-3">
            One workspace is one application. Define its stacks first — then
            map every feature to one.
          </p>
          <Button asChild size="sm" className="mt-4">
            <Link href={`/${workspaceSlug}/settings/stacks`}>
              Set up stacks
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-4" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search features…"
          aria-label="Search features"
          className="h-8 w-full rounded-[var(--radius-md)] border bg-background pl-8 pr-3 text-[13px] text-fg-1 placeholder:text-fg-4 focus:border-ring focus:outline-none focus-visible:shadow-[var(--shadow-focus)]"
        />
      </div>

      {graph.features.length === 0 ? (
        <p className="mt-6 text-center text-[13px] text-fg-3">
          No features yet. Add the first one
          {canEdit ? " with “New feature”" : ""} — or let the agent map them
          from your PRDs once sync lands (Step 49).
        </p>
      ) : null}

      <div className="mt-5 space-y-6">
        {grouped.map(({ stack, features }) => (
          <section key={stack.id}>
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-2.5 rounded-[var(--radius-full)]"
                style={{ backgroundColor: stack.color }}
              />
              <h2 className="text-[13px] font-semibold text-fg-1">
                {stack.name}
              </h2>
              <span className="text-[11px] text-fg-4">{features.length}</span>
              {canEdit ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`New feature in ${stack.name}`}
                  className="ml-auto"
                  onClick={() => onNew(stack.id)}
                >
                  <Plus />
                </Button>
              ) : null}
            </div>

            {features.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {features.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(f.id)}
                      className="flex w-full items-center gap-2.5 rounded-[var(--radius-md)] border bg-background px-3 py-2 text-left hover:bg-bg-hover"
                    >
                      <span
                        aria-hidden
                        title={FEATURE_STATUS_LABELS[f.status]}
                        className="size-1.5 shrink-0 rounded-[var(--radius-full)]"
                        style={{
                          backgroundColor: FEATURE_STATUS_COLORS[f.status],
                        }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[13px] font-medium text-fg-1">
                            {f.name}
                          </span>
                          {f.origin === "AGENT" ? (
                            <Bot
                              className="size-3 shrink-0 text-fg-4"
                              aria-label="Suggested by agent"
                            />
                          ) : null}
                        </span>
                        <span className="block truncate text-[12px] text-fg-3">
                          {f.summary}
                        </span>
                      </span>
                      <span className="shrink-0 text-[11px] text-fg-4">
                        {f.pageCount === 1 ? "1 PRD" : `${f.pageCount} PRDs`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 px-1 text-[12px] text-fg-4">
                {query ? "No matches in this stack." : "No features yet."}
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
