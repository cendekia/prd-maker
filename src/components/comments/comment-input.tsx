"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import type { MentionMember } from "@/components/editor/extensions/mention";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface CommentInputHandle {
  /** Programmatically focus the textarea (used after opening a thread). */
  focus: () => void;
}

interface Props {
  /** Workspace id powers the @mention member fetcher. */
  workspaceId: string;
  /** Submit handler — receives the body in `@[name](userId)` marker form. */
  onSubmit: (body: string) => Promise<void> | void;
  /** Initial body when editing an existing comment. */
  initialBody?: string;
  /** Submit button label — "Comment" when new, "Reply" when in a thread. */
  submitLabel?: string;
  placeholder?: string;
  className?: string;
  /** Optional cancel button (used in reply input). */
  onCancel?: () => void;
  /** Auto-focus on mount. */
  autoFocus?: boolean;
}

/**
 * Textarea that supports `@user` autocompletion against the workspace
 * member list. Selecting a member inserts `@[Name](userId)` into the body
 * — that marker is the canonical mention format for the API + the renderer.
 */
export const CommentInput = forwardRef<CommentInputHandle, Props>(
  function CommentInput(
    {
      workspaceId,
      onSubmit,
      initialBody = "",
      submitLabel = "Comment",
      placeholder = "Add a comment…",
      className,
      onCancel,
      autoFocus,
    },
    ref,
  ) {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const [value, setValue] = useState(initialBody);
    const [submitting, setSubmitting] = useState(false);
    const [popover, setPopover] = useState<{
      query: string;
      anchorStart: number;
    } | null>(null);
    const [results, setResults] = useState<MentionMember[]>([]);
    const [selected, setSelected] = useState(0);

    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
    }));

    useEffect(() => {
      if (autoFocus) textareaRef.current?.focus();
    }, [autoFocus]);

    // Debounced fetch of workspace members when the popover is open.
    useEffect(() => {
      if (!popover) {
        setResults([]);
        return;
      }
      const ctrl = new AbortController();
      const t = setTimeout(async () => {
        try {
          const url = new URL(
            `/api/workspaces/${workspaceId}/members/search`,
            window.location.origin,
          );
          if (popover.query) url.searchParams.set("q", popover.query);
          url.searchParams.set("limit", "8");
          const res = await fetch(url.toString(), { signal: ctrl.signal });
          if (!res.ok) return;
          const data = (await res.json()) as { results: MentionMember[] };
          setResults(data.results);
          setSelected(0);
        } catch {
          /* aborted */
        }
      }, 120);
      return () => {
        ctrl.abort();
        clearTimeout(t);
      };
    }, [popover, workspaceId]);

    /** Recompute the popover state from the textarea contents + caret. */
    const recompute = useCallback((next: string, caret: number) => {
      // Find the most recent `@` that isn't inside a finished `@[...](...)`.
      // Simple rule: walk back from caret until whitespace or `@`.
      let i = caret - 1;
      while (i >= 0) {
        const ch = next[i];
        if (ch === "@") {
          // Treat as trigger only when it's at the start or preceded by ws.
          const before = i === 0 ? " " : next[i - 1];
          if (/\s|^/.test(before) || i === 0) {
            const query = next.slice(i + 1, caret);
            // Stop if the query crosses a newline or contains markup.
            if (/[\n\[\]()]/.test(query)) break;
            setPopover({ query, anchorStart: i });
            return;
          }
          break;
        }
        if (ch === " " || ch === "\n" || ch === "\t") break;
        i--;
      }
      setPopover(null);
    }, []);

    function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
      const next = e.target.value;
      setValue(next);
      recompute(next, e.target.selectionStart ?? next.length);
    }

    function insertMention(member: MentionMember) {
      if (!popover) return;
      const label = member.name ?? member.email.split("@")[0];
      const marker = `@[${label}](${member.id}) `;
      const before = value.slice(0, popover.anchorStart);
      // Skip past the typed query (anchorStart .. caret).
      const caret =
        textareaRef.current?.selectionStart ??
        popover.anchorStart + 1 + popover.query.length;
      const after = value.slice(caret);
      const next = before + marker + after;
      setValue(next);
      setPopover(null);
      // Restore caret after the inserted marker.
      requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        const newPos = before.length + marker.length;
        ta.focus();
        ta.setSelectionRange(newPos, newPos);
      });
    }

    function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
      if (popover && results.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelected((s) => (s + 1) % results.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelected((s) => (s - 1 + results.length) % results.length);
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          insertMention(results[selected]);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setPopover(null);
          return;
        }
      }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        submit();
      }
    }

    async function submit() {
      const trimmed = value.trim();
      if (!trimmed || submitting) return;
      setSubmitting(true);
      try {
        await onSubmit(trimmed);
        setValue("");
        setPopover(null);
      } finally {
        setSubmitting(false);
      }
    }

    return (
      <div className={cn("relative", className)}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onBlur={() => {
            // Defer so a click on the popover registers first.
            setTimeout(() => setPopover(null), 120);
          }}
          rows={3}
          placeholder={placeholder}
          className="w-full resize-y rounded-[var(--radius-md)] border bg-background px-3 py-2 text-[13px] text-fg-1 placeholder:text-fg-4 focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {popover ? (
          <div
            role="listbox"
            className="absolute left-0 right-0 top-full z-[var(--z-dropdown)] mt-1 max-h-60 overflow-y-auto rounded-[var(--radius-md)] border bg-popover p-1 shadow-[var(--shadow-lg)]"
          >
            {results.length === 0 ? (
              <div className="px-2 py-1.5 text-[12px] text-fg-3">
                {popover.query
                  ? `No members match “${popover.query}”.`
                  : "Type to search members."}
              </div>
            ) : (
              results.map((m, idx) => {
                const active = idx === selected;
                const label = m.name ?? m.email.split("@")[0];
                return (
                  <button
                    key={m.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertMention(m);
                    }}
                    onMouseEnter={() => setSelected(idx)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left",
                      active
                        ? "bg-bg-active text-fg-1"
                        : "text-fg-2 hover:bg-bg-hover hover:text-fg-1",
                    )}
                  >
                    <Avatar name={label} src={m.image} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg-1">
                      {label}
                    </span>
                    <span className="truncate text-[11px] text-fg-3">{m.email}</span>
                  </button>
                );
              })
            )}
          </div>
        ) : null}

        <div className="mt-2 flex items-center justify-end gap-2">
          {onCancel ? (
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
          ) : null}
          <Button
            size="sm"
            onClick={submit}
            disabled={value.trim().length === 0 || submitting}
          >
            {submitting ? "Sending…" : submitLabel}
          </Button>
        </div>
      </div>
    );
  },
);
