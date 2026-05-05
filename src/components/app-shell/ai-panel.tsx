"use client";

import { Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";

interface Props {
  onClose: () => void;
}

export function AIPanel({ onClose }: Props) {
  return (
    <aside
      className="flex shrink-0 flex-col border-l bg-bg-subtle"
      style={{ width: "var(--ai-panel-width)" }}
    >
      <div
        className="flex shrink-0 items-center justify-between border-b px-3"
        style={{ height: "var(--topbar-height)" }}
      >
        <div className="flex items-center gap-2 text-[13px] font-medium text-fg-1">
          <Sparkles className="size-4 text-brand-500" />
          AI assistant
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close AI panel"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <Sparkles className="mb-3 size-6 text-brand-500" />
        <p className="t-h3 text-fg-1">Ask anything about this PRD</p>
        <p className="mt-2 text-[13px] leading-[18px] text-fg-3">
          The AI panel arrives in step 20 — you&apos;ll be able to ask
          questions, draft sections with{" "}
          <span className="text-fg-1">Guide me</span>, and apply edits straight
          to the page with a one-click pre-AI snapshot.
        </p>
      </div>
    </aside>
  );
}
