"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Radar } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  FEATURE_LINK_KIND_LABELS,
  IMPACT_KIND_LABELS,
  IMPACT_SEVERITY_COLORS,
  IMPACT_SEVERITY_LABELS,
  type ImpactAnalysisItem,
  type ImpactFeatureMeta,
} from "@/lib/agent/types";
import { cn } from "@/lib/utils";

interface Props {
  pageId: string;
  workspaceSlug: string;
  editable: boolean;
  initialAnalyses: ImpactAnalysisItem[];
  initialFeatureMeta: Record<string, ImpactFeatureMeta>;
  /** This PRD has a MODIFIES connection — i.e. it's a change request. */
  hasModifies: boolean;
}

/**
 * The PRD's impact card (Step 52): latest blast-radius report with severity
 * chips and map deep-links, run history, re-run, and "apply suggestions"
 * feeding the Step 50 review queue.
 */
export function ImpactCard({
  pageId,
  workspaceSlug,
  editable,
  initialAnalyses,
  initialFeatureMeta,
  hasModifies,
}: Props) {
  const router = useRouter();
  const [analyses, setAnalyses] = useState(initialAnalyses);
  const [featureMeta, setFeatureMeta] = useState(initialFeatureMeta);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialAnalyses[0]?.id ?? null,
  );
  const [collapsed, setCollapsed] = useState(false);
  const [running, setRunning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const selected = analyses.find((a) => a.id === selectedId) ?? null;

  const grouped = useMemo(() => {
    if (!selected?.report) return [];
    const groups = new Map<
      string,
      { feature: (typeof selected.report.impactedFeatures)[number]; meta?: ImpactFeatureMeta }[]
    >();
    for (const f of selected.report.impactedFeatures) {
      const meta = featureMeta[f.featureId];
      const key = meta?.stackName ?? "Other";
      const list = groups.get(key) ?? [];
      list.push({ feature: f, meta });
      groups.set(key, list);
    }
    return [...groups.entries()];
  }, [selected, featureMeta]);

  async function run() {
    setRunning(true);
    setNote(null);
    try {
      const res = await fetch("/api/agent/impact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId, action: "run" }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (d.error === "quota_exceeded") {
          throw new Error(
            "Out of managed AI credits this month — add a personal key in Account → API keys to keep analyzing.",
          );
        }
        throw new Error(d.message ?? d.error ?? "The analysis failed.");
      }
      const analysis = d.analysis as ImpactAnalysisItem;
      setAnalyses((a) => [analysis, ...a]);
      setFeatureMeta((m) => ({ ...m, ...(d.featureMeta ?? {}) }));
      setSelectedId(analysis.id);
      setCollapsed(false);
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  async function apply() {
    if (!selected) return;
    setApplying(true);
    setNote(null);
    try {
      const res = await fetch("/api/agent/impact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageId,
          action: "apply",
          analysisId: selected.id,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Couldn’t apply.");
      const { linksProposed, joinsProposed } = d.applied as {
        linksProposed: number;
        joinsProposed: number;
      };
      setNote(
        linksProposed + joinsProposed > 0
          ? `Queued ${linksProposed + joinsProposed} suggestion${linksProposed + joinsProposed === 1 ? "" : "s"} for review in Features → Suggestions.`
          : "Nothing new to queue — the graph already covers this report.",
      );
      router.refresh();
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setApplying(false);
    }
  }

  // Nothing to show and nothing to do.
  if (analyses.length === 0 && !editable) return null;

  return (
    <div className="mb-6 rounded-[var(--radius-lg)] border bg-bg-subtle px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Radar className="size-4 shrink-0 text-brand-500" />
        <span className="text-[13px] font-medium text-fg-1">
          Impact analysis
        </span>

        {analyses.length > 1 ? (
          <select
            aria-label="Run history"
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(e.target.value)}
            className="rounded-[var(--radius-sm)] border bg-background px-1.5 py-0.5 text-[11px] text-fg-2 focus:border-ring focus:outline-none"
          >
            {analyses.map((a) => (
              <option key={a.id} value={a.id}>
                {new Date(a.createdAt).toLocaleString()}
                {a.status !== "READY" ? ` (${a.status.toLowerCase()})` : ""}
              </option>
            ))}
          </select>
        ) : selected ? (
          <span className="text-[11px] text-fg-4">
            {new Date(selected.createdAt).toLocaleString()}
          </span>
        ) : null}

        <div className="ml-auto flex items-center gap-1">
          {editable ? (
            <Button size="sm" variant="outline" onClick={run} disabled={running}>
              {running
                ? "Analyzing…"
                : analyses.length > 0
                  ? "Re-run"
                  : "Analyze impact"}
            </Button>
          ) : null}
          {analyses.length > 0 ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={collapsed ? "Expand" : "Collapse"}
              onClick={() => setCollapsed((c) => !c)}
            >
              <ChevronDown
                className={cn("transition-transform", collapsed && "-rotate-90")}
              />
            </Button>
          ) : null}
        </div>
      </div>

      {note ? (
        <p className="mt-2 rounded-[var(--radius-sm)] bg-background px-2 py-1.5 text-[12px] text-fg-2">
          {note}
        </p>
      ) : null}

      {analyses.length === 0 && editable && !running ? (
        <p className="mt-1.5 text-[12px] leading-[18px] text-fg-3">
          {hasModifies
            ? "This PRD modifies existing features — run an analysis to see what it touches across stacks."
            : "See which existing features this PRD would touch, across every stack."}
        </p>
      ) : null}

      {!collapsed && selected ? (
        selected.status === "READY" && selected.report ? (
          <div className="mt-2 space-y-3">
            <p className="text-[13px] leading-[19px] text-fg-1">
              {selected.report.summary}
            </p>

            {grouped.length > 0 ? (
              <div className="space-y-2">
                {grouped.map(([stackName, items]) => (
                  <div key={stackName}>
                    <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-3">
                      <span
                        aria-hidden
                        className="size-2 rounded-[var(--radius-full)]"
                        style={{
                          backgroundColor:
                            items[0]?.meta?.stackColor ?? "var(--fg-4)",
                        }}
                      />
                      {stackName}
                    </p>
                    <ul className="space-y-1">
                      {items.map(({ feature }, i) => (
                        <li
                          key={`${feature.featureId}-${i}`}
                          className="rounded-[var(--radius-md)] border bg-background px-2.5 py-1.5"
                        >
                          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                            <span
                              className="rounded-[var(--radius-full)] border px-1.5 py-0.5 text-[10px] font-semibold"
                              style={{
                                color: IMPACT_SEVERITY_COLORS[feature.severity],
                              }}
                            >
                              {IMPACT_SEVERITY_LABELS[feature.severity]}
                            </span>
                            <span className="text-[10px] uppercase tracking-wide text-fg-4">
                              {IMPACT_KIND_LABELS[feature.kind]}
                            </span>
                            <Link
                              href={`/${workspaceSlug}/features?tab=map&feature=${feature.featureId}`}
                              className="font-medium text-fg-1 underline-offset-2 hover:underline"
                            >
                              {feature.name}
                            </Link>
                          </div>
                          <p className="mt-0.5 text-[12px] leading-[17px] text-fg-3">
                            {feature.rationale}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-fg-3">
                No existing features impacted.
              </p>
            )}

            {selected.report.suggestedLinks.length > 0 ? (
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-3">
                    Proposed links ({selected.report.suggestedLinks.length})
                  </p>
                  {editable ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={apply}
                      disabled={applying}
                    >
                      {applying ? "Queuing…" : "Apply suggestions"}
                    </Button>
                  ) : null}
                </div>
                <ul className="space-y-0.5">
                  {selected.report.suggestedLinks.map((l, i) => (
                    <li key={i} className="text-[12px] leading-[18px] text-fg-2">
                      <span className="font-medium text-fg-1">{l.from.name}</span>{" "}
                      —{FEATURE_LINK_KIND_LABELS[l.kind].toLowerCase()}→{" "}
                      <span className="font-medium text-fg-1">{l.to.name}</span>
                      <span className="text-fg-4"> · {l.rationale}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {selected.report.contractNotes.length > 0 ? (
              <NoteList
                title="Cross-stack contracts"
                items={selected.report.contractNotes}
              />
            ) : null}
            {selected.report.openQuestions.length > 0 ? (
              <NoteList
                title="Open questions"
                items={selected.report.openQuestions}
              />
            ) : null}
          </div>
        ) : selected.status === "FAILED" ? (
          <p className="mt-2 text-[12px] text-destructive">
            This run failed: {selected.error ?? "unknown error"}
            {editable ? " — re-run to try again." : ""}
          </p>
        ) : (
          <p className="mt-2 text-[12px] text-fg-3">
            This run was interrupted{editable ? " — re-run to try again." : "."}
          </p>
        )
      ) : null}
    </div>
  );
}

function NoteList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-fg-3">
        {title}
      </p>
      <ul className="list-disc space-y-0.5 pl-4">
        {items.map((item, i) => (
          <li key={i} className="text-[12px] leading-[18px] text-fg-2">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
