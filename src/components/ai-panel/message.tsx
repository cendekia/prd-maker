"use client";

import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/hooks/use-ai-chat";

/**
 * One chat turn. User turns are right-aligned chips; assistant turns render
 * full-width as plain text with preserved whitespace (Markdown source — rich
 * rendering and "Apply to page" arrive in Step 21). While the assistant turn
 * is still empty mid-stream we show a typing indicator.
 */
export function Message({
  message,
  streaming,
}: {
  message: ChatMessage;
  streaming?: boolean;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-[var(--radius-lg)] bg-brand-500 px-3 py-2 text-[13px] leading-[18px] text-white">
          {message.content}
        </div>
      </div>
    );
  }

  const empty = message.content.length === 0;
  return (
    <div className="flex gap-2">
      <div className="mt-0.5 shrink-0">
        <Sparkles className="size-4 text-brand-500" />
      </div>
      <div
        className={cn(
          "min-w-0 flex-1 whitespace-pre-wrap break-words text-[13px] leading-[20px] text-fg-1",
        )}
      >
        {empty && streaming ? <TypingDots /> : message.content}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1" aria-label="Assistant is typing">
      <span className="size-1.5 animate-pulse rounded-[var(--radius-full)] bg-fg-4 [animation-delay:0ms]" />
      <span className="size-1.5 animate-pulse rounded-[var(--radius-full)] bg-fg-4 [animation-delay:150ms]" />
      <span className="size-1.5 animate-pulse rounded-[var(--radius-full)] bg-fg-4 [animation-delay:300ms]" />
    </span>
  );
}
