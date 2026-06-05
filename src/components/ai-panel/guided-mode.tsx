"use client";

import { ChevronRight } from "lucide-react";

import { GUIDED_STAGES, type GuidedStage } from "@/lib/ai-prompts";
import { cn } from "@/lib/utils";

/**
 * Stage stepper for the guided Request → Plan → Spec workflow (Step 21).
 * Selecting a stage changes which prompt the next message uses; the
 * conversation itself is shared, so later stages build on earlier answers.
 */
export function GuidedMode({
  activeStage,
  onStageChange,
}: {
  activeStage: GuidedStage;
  onStageChange: (stage: GuidedStage) => void;
}) {
  const active = GUIDED_STAGES.find((s) => s.id === activeStage);
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
    </div>
  );
}
