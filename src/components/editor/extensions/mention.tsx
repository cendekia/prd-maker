"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { Node, mergeAttributes, type RawCommands } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import tippy, { type Instance, type Props as TippyProps } from "tippy.js";

import { cn } from "@/lib/utils";

export interface MentionMember {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

export interface MentionExtensionOptions {
  workspaceId: string;
  fetchMembers: (query: string) => Promise<MentionMember[]>;
  HTMLAttributes: Record<string, unknown>;
}

const MentionPluginKey = new PluginKey("mention");

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    mention: {
      insertMention: (member: MentionMember) => ReturnType;
    };
  }
}

/**
 * `@user` mention as an atomic inline node. The trigger is `@`; typing it
 * opens a popover listing workspace members (filtered by the typed query).
 * Selecting a member inserts a chip with the user's id as an attribute.
 */
export const Mention = Node.create<MentionExtensionOptions>({
  name: "mention",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return {
      workspaceId: "",
      fetchMembers: async () => [],
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      userId: { default: null },
      label: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="mention"]',
        getAttrs: (el) => ({
          userId: (el as HTMLElement).getAttribute("data-user-id"),
          label: (el as HTMLElement).getAttribute("data-label") ?? null,
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "mention",
        "data-user-id": node.attrs.userId,
        "data-label": node.attrs.label,
        class: "mention-chip",
      }),
      `@${node.attrs.label ?? "user"}`,
    ];
  },

  addCommands() {
    return {
      insertMention:
        (member: MentionMember) =>
        ({ chain }) => {
          const label = member.name ?? member.email.split("@")[0];
          return chain()
            .insertContent({
              type: this.name,
              attrs: { userId: member.id, label },
            })
            .insertContent(" ")
            .run();
        },
    } as Partial<RawCommands>;
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<MentionMember>({
        editor: this.editor,
        pluginKey: MentionPluginKey,
        char: "@",
        startOfLine: false,
        allowSpaces: false,
        items: async ({ query }: { query: string }) => {
          return this.options.fetchMembers(query);
        },
        command: ({ editor, range, props }) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertMention(props)
            .run();
        },
        render: () => {
          let component: ReactRenderer<
            { onKeyDown: (props: { event: KeyboardEvent }) => boolean },
            React.ComponentProps<typeof MentionList>
          > | null = null;
          let popup: Instance<TippyProps>[] | null = null;

          return {
            onStart: (props) => {
              component = new ReactRenderer(MentionList, {
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

const MentionList = forwardRef<ListRef, SuggestionProps<MentionMember>>(
  function MentionList(props, ref) {
    const [selected, setSelected] = useState(0);

    useEffect(() => setSelected(0), [props.items]);

    function selectItem(idx: number) {
      const item = props.items[idx];
      if (item) props.command(item);
    }

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === "ArrowUp") {
          setSelected(
            (s) => (s + props.items.length - 1) % Math.max(props.items.length, 1),
          );
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
            ? `No members match “${props.query}”.`
            : "Type to search members."}
        </div>
      );
    }

    return (
      <div className="w-72 max-h-72 overflow-y-auto rounded-[var(--radius-md)] border bg-popover p-1 shadow-[var(--shadow-lg)]">
        {props.items.map((m, idx) => {
          const active = idx === selected;
          const label = m.name ?? m.email.split("@")[0];
          return (
            <button
              key={m.id}
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
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg-1">
                {label}
              </span>
              <span className="truncate text-[11px] text-fg-3">{m.email}</span>
            </button>
          );
        })}
      </div>
    );
  },
);
