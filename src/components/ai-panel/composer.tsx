"use client";

import { useRef, useState } from "react";
import { ArrowUp } from "lucide-react";

import { cn } from "@/lib/utils";

const MAX_HEIGHT = 160;

/**
 * Chat input. Enter sends; Shift+Enter inserts a newline. The textarea grows
 * with content up to a cap, then scrolls.
 */
export function Composer({
  onSend,
  disabled,
  placeholder = "Ask about this PRD…",
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  function resize() {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }

  function submit() {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
    requestAnimationFrame(resize);
  }

  return (
    <div className="border-t p-3">
      <div className="flex items-end gap-2 rounded-[var(--radius-lg)] border bg-background px-2.5 py-2 focus-within:border-ring focus-within:shadow-[var(--shadow-focus)]">
        <textarea
          ref={ref}
          rows={1}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => {
            setValue(e.target.value);
            resize();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          className={cn(
            "max-h-40 min-h-[20px] flex-1 resize-none bg-transparent text-[13px] leading-[20px] text-fg-1 outline-none",
            "placeholder:text-fg-4 disabled:opacity-50",
          )}
        />
        <button
          type="button"
          aria-label="Send message"
          disabled={disabled || value.trim().length === 0}
          onClick={submit}
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-brand-500 text-white transition-colors",
            "hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40",
          )}
        >
          <ArrowUp className="size-4" />
        </button>
      </div>
    </div>
  );
}
