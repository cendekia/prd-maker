"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Radar } from "lucide-react";

import { GUIDED_STAGES, type GuidedStage } from "@/lib/ai-prompts";
import { cn } from "@/lib/utils";

/**
 * Stage stepper for the guided Request → Plan → Spec workflow (Step 21).
 * Selecting a stage changes which prompt the next message uses; the
 * conversation itself is shared, so later stages build on earlier answers.
 *
 * Step 53: after a guided deliverable is applied to the page, offer to run an
 * impact analysis so the team immediately sees what the new content touches
 * across the application's stacks.
 */
export function GuidedMode({
  pageId,
  activeStage,
  onStageChange,
}: {
  pageId: string;
  activeStage: GuidedStage;
  onStageChange: (stage: GuidedStage) => void;
}) {
  const router = useRouter();
  const active = GUIDED_STAGES.find((s) => s.id === activeStage);
  const [applied, setApplied] = useState(false);
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // A guided deliverable was just applied to the page — reveal the CTA.
  useEffect(() => {
    function onApplied(e: Event) {
      const detail = (e as CustomEvent<{ ok: boolean }>).detail;
      if (detail?.ok) {
        setApplied(true);
        setNote(null);
      }
    }
    document.addEventListener("prdmaker:ai-apply-done", onApplied);
    return () =>
      document.removeEventListener("prdmaker:ai-apply-done", onApplied);
  }, []);

  async function runImpact() {
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
        throw new Error(
          d.error === "quota_exceeded"
            ? "Out of managed AI credits — add a personal key to keep analyzing."
            : (d.message ?? d.error ?? "The analysis failed."),
        );
      }
      setNote("Report added — see the impact card above the editor.");
      setApplied(false);
      router.refresh();
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="shrink-0 border-b bg-background px-3 py-2.5">
      <div className="flex items-center gap-1">
        {GUIDED_STAGES.map((stage, i) => {
          const isActive = stage.id === activeStage;
          return (
            <div key={stage.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onStageChange(stage.id)}
                aria-current={isActive ? "step" : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-[var(--radius-md)] px-2 py-1 text-[12px] font-medium transition-colors",
                  isActive
                    ? "bg-brand-500 text-white"
                    : "text-fg-3 hover:bg-bg-hover hover:text-fg-1",
                )}
              >
                <span
                  className={cn(
                    "flex size-4 items-center justify-center rounded-[var(--radius-full)] text-[10px]",
                    isActive ? "bg-white/20" : "bg-bg-active text-fg-3",
                  )}
                >
                  {i + 1}
                </span>
                {stage.label}
              </button>
              {i < GUIDED_STAGES.length - 1 ? (
                <ChevronRight className="size-3 text-fg-4" />
              ) : null}
            </div>
          );
        })}
      </div>
      {active ? (
        <p className="mt-1.5 text-[12px] text-fg-3">{active.blurb}</p>
      ) : null}

      {applied ? (
        <button
          type="button"
          onClick={runImpact}
          disabled={running}
          className={cn(
            "mt-2 flex w-full items-center gap-2 rounded-[var(--radius-md)] border px-2.5 py-1.5 text-left text-[12px] text-fg-2",
            "hover:bg-bg-hover hover:text-fg-1 disabled:opacity-60",
          )}
        >
          <Radar className="size-3.5 shrink-0 text-brand-500" />
          {running
            ? "Analyzing impact…"
            : "Applied — analyze what this PRD impacts"}
        </button>
      ) : null}
      {note ? <p className="mt-1.5 text-[11px] text-fg-3">{note}</p> : null}
    </div>
  );
}
