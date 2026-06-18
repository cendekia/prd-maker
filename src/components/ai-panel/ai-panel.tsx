"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Radar, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAiChat } from "@/hooks/use-ai-chat";
import { useAgentChat } from "@/hooks/use-agent-chat";
import { GUIDED_STAGES, type GuidedStage } from "@/lib/ai-prompts";
import { cn } from "@/lib/utils";

import { ApplyToPageButton } from "./apply-to-page-button";
import { Composer } from "./composer";
import { GuidedMode } from "./guided-mode";
import { Message } from "./message";
import { QuotaNotice } from "./quota-notice";
import { ToolActivity } from "./tool-activity";

const SUGGESTIONS = [
  "Summarize this PRD",
  "What's missing or unclear?",
  "Draft acceptance criteria",
];

const AGENT_SUGGESTIONS = [
  "What does this application look like?",
  "What's connected to the login feature?",
  "What would a forgot-password feature impact?",
];

type Mode = "chat" | "guided";
type Scope = "page" | "workspace";

interface Props {
  pageId: string | null;
  workspace: { id: string; slug: string };
  onClose: () => void;
}

export function AIPanel({ pageId, workspace, onClose }: Props) {
  const [scope, setScope] = useState<Scope>(pageId ? "page" : "workspace");
  const page = useAiChat(pageId);
  const agent = useAgentChat(workspace.id);
  const [mode, setMode] = useState<Mode>("chat");
  const [stage, setStage] = useState<GuidedStage>("request");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Off a page there's nothing for page scope to talk to — follow the route.
  useEffect(() => {
    if (!pageId) setScope("workspace");
  }, [pageId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [page.messages, agent.messages]);

  const isWorkspace = scope === "workspace";
  const active = isWorkspace ? agent : page;
  const streaming = active.status === "streaming";
  const blocked = active.quotaExceeded && !active.byo;
  const guided = !isWorkspace && mode === "guided";

  const composerDisabled =
    streaming || active.status === "loading" || blocked || (!isWorkspace && !pageId);
  const placeholder = blocked
    ? "Out of managed AI credits"
    : isWorkspace
      ? "Ask about the whole application…"
      : guided
        ? GUIDED_STAGES.find((s) => s.id === stage)?.placeholder ?? "Ask…"
        : "Ask about this PRD…";

  const showIntro =
    active.messages.length === 0 &&
    !blocked &&
    active.status !== "loading" &&
    (isWorkspace || !!pageId);

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
          {isWorkspace ? "Workspace agent" : "AI assistant"}
          <span className="rounded-[var(--radius-full)] bg-bg-active px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wide text-fg-3">
            {active.byo ? "Personal key" : "Managed"}
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

      {/* Scope: the page assistant vs the workspace agent */}
      <div className="flex shrink-0 items-center gap-1 border-b bg-background px-3 py-2">
        <ModeTab
          label="This page"
          active={!isWorkspace}
          onClick={() => setScope("page")}
        />
        <ModeTab
          label="Workspace"
          active={isWorkspace}
          onClick={() => setScope("workspace")}
        />
        {!isWorkspace ? (
          <div className="ml-auto flex items-center gap-1">
            <ModeTab
              label="Chat"
              active={mode === "chat"}
              onClick={() => setMode("chat")}
            />
            <ModeTab
              label="Guide me"
              active={mode === "guided"}
              onClick={() => setMode("guided")}
            />
          </div>
        ) : null}
      </div>

      {isWorkspace && pageId ? <ImpactQuickAction pageId={pageId} /> : null}

      {!isWorkspace && !pageId ? (
        <EmptyState
          title="Open a PRD to start chatting"
          body="Page scope works on the document you're viewing. Open one, or switch to Workspace to talk to the agent about the whole application."
        />
      ) : (
        <>
          {guided && pageId ? (
            <GuidedMode
              pageId={pageId}
              activeStage={stage}
              onStageChange={setStage}
            />
          ) : null}

          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-3">
            {showIntro ? (
              isWorkspace ? (
                <div className="flex flex-col items-center px-3 pt-6 text-center">
                  <Sparkles className="mb-3 size-6 text-brand-500" />
                  <p className="t-h3 text-fg-1">Ask the workspace agent</p>
                  <p className="mt-2 text-[13px] leading-[18px] text-fg-3">
                    It knows your stacks and feature map, can read PRDs, and
                    suggests features and links — every suggestion waits for
                    your review.
                  </p>
                  <div className="mt-4 flex w-full flex-col gap-1.5">
                    {AGENT_SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => agent.send(s)}
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
              ) : guided ? (
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
                        onClick={() => page.send(s)}
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

            {isWorkspace
              ? agent.messages.map((m, i) => {
                  const isLast = i === agent.messages.length - 1;
                  return (
                    <div key={m.id}>
                      {m.role === "assistant" && m.tools && m.tools.length > 0 ? (
                        <ToolActivity tools={m.tools} />
                      ) : null}
                      <Message message={m} streaming={streaming && isLast} />
                    </div>
                  );
                })
              : page.messages.map((m, i) => {
                  const isLast = i === page.messages.length - 1;
                  const appliable =
                    guided &&
                    m.role === "assistant" &&
                    m.content.trim().length > 0 &&
                    !(streaming && isLast);
                  return (
                    <div key={m.id} className="space-y-0">
                      <Message message={m} streaming={streaming && isLast} />
                      {appliable && pageId ? (
                        <div className="pl-6">
                          <ApplyToPageButton pageId={pageId} markdown={m.content} />
                        </div>
                      ) : null}
                    </div>
                  );
                })}

            {blocked ? <QuotaNotice quota={active.quota} /> : null}

            {active.error ? (
              <p className="rounded-[var(--radius-md)] bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
                {active.error}
              </p>
            ) : null}
          </div>

          <Composer
            onSend={(text) =>
              isWorkspace
                ? agent.send(text)
                : page.send(text, guided ? { stage } : undefined)
            }
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

/**
 * Workspace-mode quick action (Step 52): run a structured impact analysis
 * for the PRD that's open behind the panel; the report lands on its card.
 */
function ImpactQuickAction({ pageId }: { pageId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  const [note, setNote] = useState<string | null>(null);

  async function run() {
    setState("running");
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
      setState("done");
      setNote("Report added to the page — see the impact card above the editor.");
      router.refresh();
    } catch (e) {
      setState("idle");
      setNote((e as Error).message);
    }
  }

  return (
    <div className="shrink-0 border-b bg-background px-3 py-2">
      <button
        type="button"
        onClick={run}
        disabled={state === "running"}
        className={cn(
          "flex w-full items-center gap-2 rounded-[var(--radius-md)] border px-2.5 py-1.5 text-left text-[12px] text-fg-2",
          "hover:bg-bg-hover hover:text-fg-1 disabled:opacity-60",
        )}
      >
        <Radar className="size-3.5 shrink-0 text-brand-500" />
        {state === "running"
          ? "Analyzing this PRD's impact…"
          : "Analyze this PRD's impact"}
      </button>
      {note ? <p className="mt-1 px-1 text-[11px] text-fg-3">{note}</p> : null}
    </div>
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
