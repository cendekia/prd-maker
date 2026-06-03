"use client";

import { Node, mergeAttributes, type RawCommands } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import type { AgileStatus } from "@prisma/client";

import { EpicBlockView } from "./epic-block-view";

/** A single user story inside an epic block. Plain data, stored in the node's
 * `stories` attribute (no child nodes) so add/reorder/remove are simple array
 * ops. Distinct from the page-level agile metadata in Step 42. */
export interface EpicStory {
  id: string;
  title: string;
  asA: string;
  iWant: string;
  soThat: string;
  acceptance: string;
  points: number | null;
  status: AgileStatus;
}

export function makeStoryId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

export function emptyStory(): EpicStory {
  return {
    id: makeStoryId(),
    title: "",
    asA: "",
    iWant: "",
    soThat: "",
    acceptance: "",
    points: null,
    status: "BACKLOG",
  };
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    epicBlock: {
      /** Insert an Epic block seeded with one empty user story. */
      setEpicBlock: () => ReturnType;
    };
  }
}

/**
 * Block-level `epicBlock` node (Step 43). Atomic — a React node view renders an
 * editable card with the epic title/summary and a managed list of user stories.
 * All data lives in node attributes, so it persists in `contentJson` / Yjs like
 * any other block and is serialized for publish + export by render-page.ts /
 * export-markdown.ts.
 */
export const EpicBlock = Node.create({
  name: "epicBlock",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  isolating: true,

  addOptions() {
    return { HTMLAttributes: {} };
  },

  addAttributes() {
    return {
      title: {
        default: "",
        parseHTML: (el: HTMLElement) => el.getAttribute("data-title") ?? "",
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.title ? { "data-title": String(attrs.title) } : {},
      },
      summary: {
        default: "",
        parseHTML: (el: HTMLElement) => el.getAttribute("data-summary") ?? "",
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.summary ? { "data-summary": String(attrs.summary) } : {},
      },
      stories: {
        default: [] as EpicStory[],
        parseHTML: (el: HTMLElement) => {
          try {
            const v = JSON.parse(el.getAttribute("data-stories") ?? "[]");
            return Array.isArray(v) ? v : [];
          } catch {
            return [];
          }
        },
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-stories": JSON.stringify(attrs.stories ?? []),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="epic-block"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    // Clipboard / getHTML fallback only — the publish + export surfaces read
    // JSON via render-page.ts. We still emit the data attrs so an epic copied
    // out and back in round-trips.
    const title = typeof node.attrs.title === "string" ? node.attrs.title : "";
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "epic-block",
      }),
      ["strong", {}, `Epic: ${title || "Untitled epic"}`],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EpicBlockView);
  },

  addCommands() {
    return {
      setEpicBlock:
        () =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { title: "", summary: "", stories: [emptyStory()] },
          }),
    } as Partial<RawCommands>;
  },
});
