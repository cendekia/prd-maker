"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, {
  type SuggestionOptions,
  type SuggestionProps,
} from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import tippy, { type Instance, type Props as TippyProps } from "tippy.js";
import { FileText } from "lucide-react";

import { cn } from "@/lib/utils";

const PageLinkSuggestionPluginKey = new PluginKey("pageLinkSuggestion");

export interface PageSearchResult {
  id: string;
  title: string;
}

export interface PageLinkSuggestionExtensionOptions {
  workspaceId: string;
  fetchResults: (query: string) => Promise<PageSearchResult[]>;
  suggestion: Omit<
    SuggestionOptions<PageSearchResult>,
    "editor" | "items" | "render" | "command"
  >;
}

export const PageLinkSuggestionExtension =
  Extension.create<PageLinkSuggestionExtensionOptions>({
    name: "pageLinkSuggestion",

    addOptions() {
      return {
        workspaceId: "",
        fetchResults: async () => [],
        suggestion: {
          char: "[[",
          startOfLine: false,
          allowSpaces: true,
        },
      };
    },

    addProseMirrorPlugins() {
      return [
        Suggestion<PageSearchResult>({
          editor: this.editor,
          pluginKey: PageLinkSuggestionPluginKey,
          ...this.options.suggestion,
          items: async ({ query }: { query: string }) => {
            return this.options.fetchResults(query);
          },
          command: ({ editor, range, props }) => {
            // Replace the [[query text with a PageLink node.
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertPageLink({ pageId: props.id, title: props.title })
              .run();
          },
          render: () => {
            let component: ReactRenderer<
              { onKeyDown: (props: { event: KeyboardEvent }) => boolean },
              React.ComponentProps<typeof PageLinkSuggestionList>
            > | null = null;
            let popup: Instance<TippyProps>[] | null = null;

            return {
              onStart: (props) => {
                component = new ReactRenderer(PageLinkSuggestionList, {
                  props,
                  editor: props.editor,
                });
                if (!props.clientRect) return;
                popup = tippy("body", {
                  getReferenceClientRect: () =>
                    props.clientRect?.() ?? new DOMRect(0, 0, 0, 0),
                  appendTo: () => document.body,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: "manual",
                  placement: "bottom-start",
                });
              },
              onUpdate(props) {
                component?.updateProps(props);
                if (!props.clientRect || !popup) return;
                popup[0].setProps({
                  getReferenceClientRect: () =>
                    props.clientRect?.() ?? new DOMRect(0, 0, 0, 0),
                });
              },
              onKeyDown(props) {
                if (props.event.key === "Escape") {
                  popup?.[0].hide();
                  return true;
                }
                return component?.ref?.onKeyDown(props) ?? false;
              },
              onExit() {
                popup?.[0].destroy();
                component?.destroy();
                popup = null;
                component = null;
              },
            };
          },
        }),
      ];
    },
  });

interface ListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

const PageLinkSuggestionList = forwardRef<
  ListRef,
  SuggestionProps<PageSearchResult>
>(function PageLinkSuggestionList(props, ref) {
  const [selected, setSelected] = useState(0);

  useEffect(() => setSelected(0), [props.items]);

  function selectItem(idx: number) {
    const item = props.items[idx];
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
        {props.query
          ? `No pages match “${props.query}”.`
          : "Type to search pages."}
      </div>
    );
  }

  return (
    <div className="w-72 max-h-72 overflow-y-auto rounded-[var(--radius-md)] border bg-popover p-1 shadow-[var(--shadow-lg)]">
      {props.items.map((item, idx) => {
        const active = idx === selected;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => selectItem(idx)}
            onMouseEnter={() => setSelected(idx)}
            className={cn(
              "flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left transition-colors",
              active
                ? "bg-bg-active text-fg-1"
                : "text-fg-2 hover:bg-bg-hover hover:text-fg-1",
            )}
          >
            <FileText className="size-3.5 text-fg-3" />
            <span className="min-w-0 flex-1 truncate text-[13px]">
              {item.title || "Untitled"}
            </span>
          </button>
        );
      })}
    </div>
  );
});
