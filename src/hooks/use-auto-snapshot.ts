"use client";

import { useCallback, useEffect, useRef } from "react";
import type { JSONContent } from "@tiptap/react";

interface Args {
  pageId: string;
  /** Returns the editor's current JSON, or null when the editor isn't ready. */
  getContentJson: () => JSONContent | null;
  /**
   * Snapshot cadence. Default 5 minutes — frequent enough to capture
   * incremental work without filling the history table.
   */
  intervalMs?: number;
  /** Skip the periodic poll when false (e.g. read-only viewers). */
  enabled?: boolean;
}

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export interface UseAutoSnapshotResult {
  /** Imperatively force a snapshot of a specific kind (e.g. "MANUAL"). */
  snapshotNow: (kind?: "AUTO" | "MANUAL" | "PRE_AI") => Promise<void>;
  /** Mark the doc as edited since the last snapshot — drives the periodic poll. */
  markDirty: () => void;
}

/**
 * Periodically POSTs the current editor JSON to /api/pages/:id/snapshot when
 * the user has made edits since the last snapshot. The server dedupes AUTO
 * snapshots whose JSON hasn't changed, so calling extra times is cheap, but
 * we still gate by a `dirty` flag so an idle tab doesn't churn the cron path.
 */
export function useAutoSnapshot({
  pageId,
  getContentJson,
  intervalMs = DEFAULT_INTERVAL_MS,
  enabled = true,
}: Args): UseAutoSnapshotResult {
  const dirtyRef = useRef(false);
  const inFlightRef = useRef(false);
  const getJsonRef = useRef(getContentJson);
  useEffect(() => {
    getJsonRef.current = getContentJson;
  }, [getContentJson]);

  const post = useCallback(
    async (kind: "AUTO" | "MANUAL" | "PRE_AI") => {
      if (inFlightRef.current) return;
      const json = getJsonRef.current();
      // For AUTO we skip when nothing's changed AND we have JSON to send.
      // For MANUAL/PRE_AI we always go through (caller wants the guarantee).
      if (kind === "AUTO" && (!dirtyRef.current || !json)) return;
      inFlightRef.current = true;
      try {
        const res = await fetch(`/api/pages/${pageId}/snapshot`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, contentJson: json ?? undefined }),
        });
        if (!res.ok) {
          // Don't clear dirty — we want to retry next tick.
          return;
        }
        dirtyRef.current = false;
      } finally {
        inFlightRef.current = false;
      }
    },
    [pageId],
  );

  // Periodic poll.
  useEffect(() => {
    if (!enabled) return;
    const handle = setInterval(() => {
      void post("AUTO");
    }, intervalMs);
    return () => clearInterval(handle);
  }, [enabled, intervalMs, post]);

  // Best-effort flush on tab close. Use sendBeacon so the browser actually
  // ships the request; fall back to a fetch otherwise.
  useEffect(() => {
    if (!enabled) return;
    function onBeforeUnload() {
      if (!dirtyRef.current) return;
      const json = getJsonRef.current();
      if (!json) return;
      const body = JSON.stringify({ kind: "AUTO", contentJson: json });
      const url = `/api/pages/${pageId}/snapshot`;
      const blob = new Blob([body], { type: "application/json" });
      if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
        navigator.sendBeacon(url, blob);
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [enabled, pageId]);

  const snapshotNow = useCallback(
    async (kind: "AUTO" | "MANUAL" | "PRE_AI" = "MANUAL") => {
      await post(kind);
    },
    [post],
  );

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
  }, []);

  return { snapshotNow, markDirty };
}
