"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAiChat } from "@/hooks/use-ai-chat";
import { GUIDED_STAGES, type GuidedStage } from "@/lib/ai-prompts";
import { cn } from "@/lib/utils";

import { ApplyToPageButton } from "./apply-to-page-button";
import { Composer } from "./composer";
import { GuidedMode } from "./guided-mode";
import { Message } from "./message";
import { QuotaNotice } from "./quota-notice";

const SUGGESTIONS = [
  "Summarize this PRD",
  "What's missing or unclear?",
  "Draft acceptance criteria",
];

type Mode = "chat" | "guided";

interface Props {
  pageId: string | null;
  onClose: () => void;
}

export function AIPanel({ pageId, onClose }: Props) {
  const { messages, status, error, quota, quotaExceeded, byo, send } =
    useAiChat(pageId);
  const [mode, setMode] = useState<Mode>("chat");
  const [stage, setStage] = useState<GuidedStage>("request");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const streaming = status === "streaming";
  const blocked = quotaExceeded && !byo;
  const composerDisabled = !pageId || streaming || status === "loading" || blocked;
  const showIntro =
    !!pageId && messages.length === 0 && !blocked && status !== "loading";
  const guided = mode === "guided";
  const placeholder = blocked
    ? "Out of managed AI credits"
    : guided
      ? GUIDED_STAGES.find((s) => s.id === stage)?.placeholder ?? "Ask…"
      : "Ask about this PRD…";

  return (
    <aside
      className="pm-slide-in-right flex shrink-0 flex-col border-l bg-bg-subtle"
      style={{ width: "var(--ai-panel-width)" }}
    >
      <div
        className="flex shrink-0 items-center justify-between border-b px-3"
        style={{ height: "var(--topbar-height)" }}
      >
        <div className="flex items-center gap-2 text-[13px] font-medium text-fg-1">
          <Sparkles className="size-4 text-brand-500" />
          AI assistant
          <span className="rounded-[var(--radius-full)] bg-bg-active px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wide text-fg-3">
            {byo ? "Personal key" : "Managed"}
          </span>
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

      {!pageId ? (
        <EmptyState
          title="Open a PRD to start chatting"
          body="The AI assistant works on the page you're viewing. Open a document, then ask away."
        />
      ) : (
        <>
          {/* Chat vs Guide me */}
          <div className="flex shrink-0 items-center gap-1 border-b bg-background px-3 py-2">
            <ModeTab label="Chat" active={mode === "chat"} onClick={() => setMode("chat")} />
            <ModeTab
              label="Guide me"
              active={mode === "guided"}
              onClick={() => setMode("guided")}
            />
          </div>

          {guided ? (
            <GuidedMode activeStage={stage} onStageChange={setStage} />
          ) : null}

          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-3">
            {showIntro ? (
              guided ? (
                <p className="px-1 pt-2 text-[13px] leading-[19px] text-fg-3">
                  Start with the <strong className="text-fg-1">Request</strong>{" "}
                  stage: describe your idea below and I&apos;ll shape it into a
                  structured request. Move through Plan and Spec when ready —
                  each stage builds on the last, and you can apply any answer to
                  the page.
                </p>
              ) : (
                <div className="flex flex-col items-center px-3 pt-6 text-center">
                  <Sparkles className="mb-3 size-6 text-brand-500" />
                  <p className="t-h3 text-fg-1">Ask anything about this PRD</p>
                  <p className="mt-2 text-[13px] leading-[18px] text-fg-3">
                    Ask questions, draft sections, or pressure-test the spec.
                    The assistant sees this page&apos;s content.
                  </p>
                  <div className="mt-4 flex w-full flex-col gap-1.5">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => send(s)}
                        className={cn(
                          "rounded-[var(--radius-md)] border bg-background px-3 py-2 text-left text-[13px] text-fg-2",
                          "hover:bg-bg-hover hover:text-fg-1",
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )
            ) : null}

            {messages.map((m, i) => {
              const isLast = i === messages.length - 1;
              const appliable =
                guided &&
                m.role === "assistant" &&
                m.content.trim().length > 0 &&
                !(streaming && isLast);
              return (
                <div key={m.id} className="space-y-0">
                  <Message message={m} streaming={streaming && isLast} />
                  {appliable ? (
                    <div className="pl-6">
                      <ApplyToPageButton pageId={pageId} markdown={m.content} />
                    </div>
                  ) : null}
                </div>
              );
            })}

            {blocked ? <QuotaNotice quota={quota} /> : null}

            {error ? (
              <p className="rounded-[var(--radius-md)] bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
                {error}
              </p>
            ) : null}
          </div>

          <Composer
            onSend={(text) => send(text, guided ? { stage } : undefined)}
            disabled={composerDisabled}
            placeholder={placeholder}
          />
        </>
      )}
    </aside>
  );
}

function ModeTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-[var(--radius-md)] px-2.5 py-1 text-[12px] font-medium transition-colors",
        active
          ? "bg-bg-active text-fg-1"
          : "text-fg-3 hover:bg-bg-hover hover:text-fg-1",
      )}
    >
      {label}
    </button>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <Sparkles className="mb-3 size-6 text-brand-500" />
      <p className="t-h3 text-fg-1">{title}</p>
      <p className="mt-2 text-[13px] leading-[18px] text-fg-3">{body}</p>
    </div>
  );
}
