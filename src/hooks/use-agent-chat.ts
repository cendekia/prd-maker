"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { QuotaInfo } from "@/hooks/use-ai-chat";

/** One tool call rendered as an activity chip (live or from a saved trace). */
export interface AgentToolChip {
  name: string;
  done: boolean;
  ok?: boolean;
}

export interface AgentChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Tool activity attached to assistant turns. */
  tools?: AgentToolChip[];
}

export type AgentChatStatus = "idle" | "loading" | "streaming";

let tmpCounter = 0;
const tmpId = () => `tmp-agent-${Date.now()}-${tmpCounter++}`;

interface SavedMessage {
  id: string;
  role: string;
  content: string;
  toolUse: { name: string; ok: boolean }[] | null;
}

/**
 * Drives the workspace-scope agent chat (Step 48). Modeled on useAiChat, with
 * one addition: `{type:"tool"}` SSE events become live activity chips on the
 * in-flight assistant message ("Searching features…"), and saved tool traces
 * re-render as completed chips after reload.
 */
export function useAgentChat(workspaceId: string | null) {
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [status, setStatus] = useState<AgentChatStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [byo, setByo] = useState(false);
  const streamingRef = useRef(false);

  useEffect(() => {
    if (!workspaceId) {
      setMessages([]);
      setQuota(null);
      setQuotaExceeded(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setStatus("loading");
    setError(null);
    fetch(`/api/agent/chat?workspaceId=${encodeURIComponent(workspaceId)}`)
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
      )
      .then(
        (data: { messages: SavedMessage[]; byo: boolean; quota: QuotaInfo }) => {
          if (cancelled) return;
          setMessages(
            (data.messages ?? []).map((m) => ({
              id: m.id,
              role: m.role === "assistant" ? "assistant" : "user",
              content: m.content,
              tools: m.toolUse?.map((t) => ({
                name: t.name,
                done: true,
                ok: t.ok,
              })),
            })),
          );
          setByo(!!data.byo);
          setQuota(data.quota ?? null);
          setQuotaExceeded(
            !data.byo && data.quota ? data.quota.remaining <= 0 : false,
          );
        },
      )
      .catch(() => {
        if (!cancelled) setError("Couldn't load this conversation.");
      })
      .finally(() => {
        if (!cancelled) setStatus("idle");
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!workspaceId || !trimmed || streamingRef.current) return;

      setError(null);
      const userMsg: AgentChatMessage = {
        id: tmpId(),
        role: "user",
        content: trimmed,
      };
      const assistantMsg: AgentChatMessage = {
        id: tmpId(),
        role: "assistant",
        content: "",
        tools: [],
      };
      setMessages((m) => [...m, userMsg, assistantMsg]);
      setStatus("streaming");
      streamingRef.current = true;

      const patchAssistant = (
        fn: (msg: AgentChatMessage) => AgentChatMessage,
      ) =>
        setMessages((m) =>
          m.map((x) => (x.id === assistantMsg.id ? fn(x) : x)),
        );
      const dropAssistant = () =>
        setMessages((m) => m.filter((x) => x.id !== assistantMsg.id));

      try {
        const res = await fetch("/api/agent/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspaceId, message: trimmed }),
        });

        if (!res.ok || !res.body) {
          const data: {
            error?: string;
            message?: string;
            plan?: string;
            cap?: number;
            used?: number;
          } = await res.json().catch(() => ({}));
          if (data.error === "quota_exceeded") {
            setQuotaExceeded(true);
            if (typeof data.cap === "number" && typeof data.used === "number") {
              setQuota({
                plan: data.plan ?? "FREE",
                cap: data.cap,
                used: data.used,
                remaining: Math.max(0, data.cap - data.used),
              });
            }
          } else {
            setError(data.message ?? "Something went wrong.");
          }
          dropAssistant();
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";
          for (const chunk of chunks) {
            const line = chunk.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            const json = line.slice(5).trim();
            if (!json) continue;
            let evt: {
              type?: string;
              text?: string;
              message?: string;
              name?: string;
              status?: string;
              ok?: boolean;
            };
            try {
              evt = JSON.parse(json);
            } catch {
              continue;
            }
            if (evt.type === "delta" && evt.text) {
              patchAssistant((x) => ({ ...x, content: x.content + evt.text }));
            } else if (evt.type === "tool" && evt.name) {
              if (evt.status === "start") {
                patchAssistant((x) => ({
                  ...x,
                  tools: [...(x.tools ?? []), { name: evt.name!, done: false }],
                }));
              } else {
                patchAssistant((x) => {
                  const tools = [...(x.tools ?? [])];
                  for (let i = tools.length - 1; i >= 0; i--) {
                    if (tools[i].name === evt.name && !tools[i].done) {
                      tools[i] = { ...tools[i], done: true, ok: evt.ok };
                      break;
                    }
                  }
                  return { ...x, tools };
                });
              }
            } else if (evt.type === "error") {
              setError(evt.message ?? "The agent request failed.");
            }
          }
        }
      } catch {
        setError("Connection lost. Try again.");
      } finally {
        streamingRef.current = false;
        setStatus("idle");
      }
    },
    [workspaceId],
  );

  return { messages, status, error, quota, quotaExceeded, byo, send };
}
