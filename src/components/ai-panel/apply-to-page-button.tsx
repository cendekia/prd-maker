"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * "Apply to page" for a guided-stage deliverable (Step 21). The panel and the
 * editor live in sibling subtrees, so this dispatches a `prdmaker:ai-apply`
 * request event (the same cross-component pattern the comment marks use) and
 * waits for the editor host to report back via `prdmaker:ai-apply-done`. The
 * editor host owns the snapshot-then-apply orchestration.
 */
type State = "idle" | "applying" | "done" | "error";

let counter = 0;

export function ApplyToPageButton({
  pageId,
  markdown,
}: {
  pageId: string;
  markdown: string;
}) {
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onDone(e: Event) {
      const detail = (
        e as CustomEvent<{ requestId: string; ok: boolean; error?: string }>
      ).detail;
      if (!detail || detail.requestId !== requestRef.current) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      requestRef.current = null;
      if (detail.ok) {
        setState("done");
        setError(null);
      } else {
        setState("error");
        setError(detail.error ?? "Couldn't apply to the page.");
      }
    }
    document.addEventListener("prdmaker:ai-apply-done", onDone);
    return () => {
      document.removeEventListener("prdmaker:ai-apply-done", onDone);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function apply() {
    if (state === "applying") return;
    const requestId = `apply-${Date.now()}-${counter++}`;
    requestRef.current = requestId;
    setState("applying");
    setError(null);
    document.dispatchEvent(
      new CustomEvent("prdmaker:ai-apply", {
        detail: { requestId, pageId, markdown },
      }),
    );
    // Safety: if no editor host responds (e.g. editor not mounted), recover.
    timerRef.current = setTimeout(() => {
      if (requestRef.current === requestId) {
        requestRef.current = null;
        setState("error");
        setError("Open the page in the editor, then try again.");
      }
    }, 15_000);
  }

  return (
    <div className="mt-1.5 flex flex-col items-start gap-1">
      <Button
        variant={state === "done" ? "ghost" : "outline"}
        size="sm"
        disabled={state === "applying"}
        onClick={apply}
      >
        {state === "applying" ? (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            Applying…
          </>
        ) : state === "done" ? (
          <>
            <Check className="size-3.5 text-success" />
            Applied to page
          </>
        ) : (
          <>
            <ArrowDownToLine className="size-3.5" />
            {state === "error" ? "Retry apply" : "Apply to page"}
          </>
        )}
      </Button>
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}
