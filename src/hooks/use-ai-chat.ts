"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface QuotaInfo {
  plan: string;
  cap: number;
  used: number;
  remaining: number;
}

export type ChatStatus = "idle" | "loading" | "streaming";

let tmpCounter = 0;
const tmpId = () => `tmp-${Date.now()}-${tmpCounter++}`;

/**
 * Drives the AI side-panel chat (Step 20): loads the page's saved thread, sends
 * messages, and consumes the SSE stream token-by-token. `quotaExceeded` flips
 * when the managed tier is out of credits so the panel can show the CTA; a
 * personal (BYO) key bypasses the cap entirely.
 */
export function useAiChat(pageId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [byo, setByo] = useState(false);
  const streamingRef = useRef(false);

  // Load saved history + quota/tier whenever the active page changes.
  useEffect(() => {
    if (!pageId) {
      setMessages([]);
      setQuota(null);
      setQuotaExceeded(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setStatus("loading");
    setError(null);
    fetch(`/api/ai/chat?pageId=${encodeURIComponent(pageId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { messages: ChatMessage[]; byo: boolean; quota: QuotaInfo }) => {
        if (cancelled) return;
        setMessages(data.messages ?? []);
        setByo(!!data.byo);
        setQuota(data.quota ?? null);
        setQuotaExceeded(!data.byo && data.quota ? data.quota.remaining <= 0 : false);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load this conversation.");
      })
      .finally(() => {
        if (!cancelled) setStatus("idle");
      });
    return () => {
      cancelled = true;
    };
  }, [pageId]);

  const send = useCallback(
    async (text: string, opts?: { stage?: string }) => {
      const trimmed = text.trim();
      if (!pageId || !trimmed || streamingRef.current) return;

      setError(null);
      const userMsg: ChatMessage = { id: tmpId(), role: "user", content: trimmed };
      const assistantMsg: ChatMessage = { id: tmpId(), role: "assistant", content: "" };
      setMessages((m) => [...m, userMsg, assistantMsg]);
      setStatus("streaming");
      streamingRef.current = true;

      const dropAssistant = () =>
        setMessages((m) => m.filter((x) => x.id !== assistantMsg.id));

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            pageId,
            message: trimmed,
            ...(opts?.stage ? { stage: opts.stage } : {}),
          }),
        });

        if (!res.ok || !res.body) {
          const data: { error?: string; message?: string; plan?: string; cap?: number; used?: number } =
            await res.json().catch(() => ({}));
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
            let evt: { type?: string; text?: string; message?: string };
            try {
              evt = JSON.parse(json);
            } catch {
              continue;
            }
            if (evt.type === "delta" && evt.text) {
              setMessages((m) =>
                m.map((x) =>
                  x.id === assistantMsg.id
                    ? { ...x, content: x.content + evt.text }
                    : x,
                ),
              );
            } else if (evt.type === "error") {
              setError(evt.message ?? "The AI request failed.");
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
    [pageId],
  );

  return { messages, status, error, quota, quotaExceeded, byo, send };
}
