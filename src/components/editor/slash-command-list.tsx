"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import type { SuggestionProps } from "@tiptap/suggestion";

import { cn } from "@/lib/utils";

import type { SlashCommandItem } from "./slash-items";

interface CommandListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export type SlashCommandListProps = SuggestionProps<SlashCommandItem>;

export const SlashCommandList = forwardRef<CommandListRef, SlashCommandListProps>(
  function SlashCommandList(props, ref) {
    const [selected, setSelected] = useState(0);

    useEffect(() => setSelected(0), [props.items]);

    function selectItem(index: number) {
      const item = props.items[index];
      if (item) props.command(item);
    }

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === "ArrowUp") {
          setSelected((s) => (s + props.items.length - 1) % Math.max(props.items.length, 1));
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelected((s) => (s + 1) % Math.max(props.items.length, 1));
          return true;
        }
        if (event.key === "Enter") {
          selectItem(selected);
          return true;
        }
        return false;
      },
    }));

    if (props.items.length === 0) {
      return (
        <div className="rounded-[var(--radius-md)] border bg-popover p-2 text-[12px] text-fg-3 shadow-[var(--shadow-lg)]">
          No matching commands.
        </div>
      );
    }

    return (
      <div className="w-72 max-h-80 overflow-y-auto rounded-[var(--radius-md)] border bg-popover p-1 shadow-[var(--shadow-lg)]">
        {props.items.map((item, index) => {
          const Icon = item.icon;
          const active = index === selected;
          return (
            <button
              key={item.title}
              type="button"
              onClick={() => selectItem(index)}
              onMouseEnter={() => setSelected(index)}
              className={cn(
                "flex w-full items-center gap-3 rounded-[var(--radius-sm)] px-2 py-1.5 text-left transition-colors",
                active ? "bg-bg-active text-fg-1" : "text-fg-2 hover:bg-bg-hover hover:text-fg-1",
              )}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border bg-background text-fg-2">
                <Icon className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-fg-1">
                  {item.title}
                </span>
                <span className="block truncate text-[11px] text-fg-3">
                  {item.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    );
  },
);
