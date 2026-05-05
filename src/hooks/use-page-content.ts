"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { JSONContent } from "@tiptap/react";

const SAVE_DEBOUNCE_MS = 800;

export type SaveState = "idle" | "saving" | "saved" | "error";

interface UsePageContentResult {
  save: (json: JSONContent) => void;
  saveState: SaveState;
  lastSavedAt: Date | null;
  error: string | null;
  /** Force a flush (e.g. on tab unload). */
  flush: () => Promise<void>;
}

/**
 * Debounced save hook for `Page.contentJson` via PUT /api/pages/:id/content.
 * The editor calls `save(json)` on every change; we batch consecutive calls
 * within `SAVE_DEBOUNCE_MS` and only PUT once.
 */
export function usePageContent(pageId: string): UsePageContentResult {
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pendingRef = useRef<JSONContent | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);

  const flush = useCallback(async () => {
    const json = pendingRef.current;
    pendingRef.current = null;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!json) return;

    setSaveState("saving");
    setError(null);
    const promise = (async () => {
      try {
        const res = await fetch(`/api/pages/${pageId}/content`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contentJson: json }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `Save failed: ${res.status}`);
        }
        setLastSavedAt(new Date());
        setSaveState("saved");
      } catch (e) {
        setError((e as Error).message);
        setSaveState("error");
      }
    })();
    inFlightRef.current = promise;
    await promise;
    inFlightRef.current = null;
  }, [pageId]);

  const save = useCallback(
    (json: JSONContent) => {
      pendingRef.current = json;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        flush();
      }, SAVE_DEBOUNCE_MS);
    },
    [flush],
  );

  // Flush on tab close / navigation away.
  useEffect(() => {
    function onBeforeUnload() {
      if (pendingRef.current) {
        // We can't await async here, but the navigator.sendBeacon path would
        // need a different request shape. Best-effort: keep the timer flush.
        flush();
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [flush]);

  // Flush on unmount.
  useEffect(() => {
    return () => {
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { save, saveState, lastSavedAt, error, flush };
}
