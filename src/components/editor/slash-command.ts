"use client";

import { Editor, Extension, Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, {
  type SuggestionOptions,
  type SuggestionProps,
} from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import tippy, { type Instance, type Props as TippyProps } from "tippy.js";

import { SlashCommandList } from "./slash-command-list";
import { defaultSlashItems, type SlashCommandItem } from "./slash-items";

const SlashCommandPluginKey = new PluginKey("slashCommand");

export interface SlashCommandsExtensionOptions {
  suggestion: Omit<
    SuggestionOptions<SlashCommandItem>,
    "editor" | "items" | "render" | "command"
  >;
}

export const SlashCommandsExtension = Extension.create<SlashCommandsExtensionOptions>(
  {
    name: "slashCommands",

    addOptions() {
      return {
        suggestion: {
          char: "/",
          startOfLine: false,
          allowSpaces: false,
        },
      };
    },

    addProseMirrorPlugins() {
      return [
        Suggestion<SlashCommandItem>({
          editor: this.editor,
          pluginKey: SlashCommandPluginKey,
          ...this.options.suggestion,
          items: ({ query }: { query: string }) => {
            const q = query.toLowerCase().trim();
            if (!q) return defaultSlashItems;
            return defaultSlashItems.filter(
              (item) =>
                item.title.toLowerCase().includes(q) ||
                item.keywords?.some((k) => k.toLowerCase().includes(q)),
            );
          },
          command: ({
            editor,
            range,
            props,
          }: {
            editor: Editor;
            range: Range;
            props: SlashCommandItem;
          }) => {
            props.command({ editor, range });
          },
          render: () => {
            let component: ReactRenderer<
              { onKeyDown: (e: { event: KeyboardEvent }) => boolean },
              React.ComponentProps<typeof SlashCommandList>
            > | null = null;
            let popup: Instance<TippyProps>[] | null = null;

            return {
              onStart: (props: SuggestionProps<SlashCommandItem>) => {
                component = new ReactRenderer(SlashCommandList, {
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
              onUpdate(props: SuggestionProps<SlashCommandItem>) {
                component?.updateProps(props);
                if (!props.clientRect || !popup) return;
                popup[0].setProps({
                  getReferenceClientRect: () =>
                    props.clientRect?.() ?? new DOMRect(0, 0, 0, 0),
                });
              },
              onKeyDown(props: { event: KeyboardEvent }) {
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
  },
);
