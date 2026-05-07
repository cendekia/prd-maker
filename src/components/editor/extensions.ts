"use client";

import StarterKit from "@tiptap/starter-kit";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { common, createLowlight } from "lowlight";

import { PageLink } from "./extensions/page-link";
import { PageLinkSuggestionExtension } from "./extensions/page-link-suggestion";
import { SlashCommandsExtension } from "./slash-command";

const lowlight = createLowlight(common);

export interface BuildExtensionsOptions {
  workspaceId: string;
  workspaceSlug: string;
  /**
   * Set to `false` when the editor binds to a Yjs Collaboration extension —
   * the Yjs CRDT replaces TipTap's local history stack, and keeping both
   * causes undo/redo conflicts.
   */
  withHistory?: boolean;
}

export function buildExtensions(opts: BuildExtensionsOptions) {
  const withHistory = opts.withHistory ?? true;
  return [
    StarterKit.configure({
      codeBlock: false,
      heading: { levels: [1, 2, 3] },
      ...(withHistory ? {} : { history: false }),
    }),
    CodeBlockLowlight.configure({ lowlight }),
    Placeholder.configure({
      placeholder: ({ node }) => {
        if (node.type.name === "heading") return "Heading";
        return "Type / for commands…";
      },
      includeChildren: false,
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      HTMLAttributes: {
        rel: "noopener noreferrer nofollow",
        class: "tiptap-link",
      },
    }),
    Image.configure({ inline: false, allowBase64: true }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({
      resizable: true,
      HTMLAttributes: { class: "tiptap-table" },
    }),
    TableRow,
    TableHeader,
    TableCell,
    PageLink.configure({ workspaceSlug: opts.workspaceSlug }),
    PageLinkSuggestionExtension.configure({
      workspaceId: opts.workspaceId,
      fetchResults: async (query: string) => {
        const url = new URL(
          `/api/workspaces/${opts.workspaceId}/pages/search`,
          window.location.origin,
        );
        if (query) url.searchParams.set("q", query);
        url.searchParams.set("limit", "8");
        const res = await fetch(url.toString());
        if (!res.ok) return [];
        const data = (await res.json()) as {
          results: { id: string; title: string }[];
        };
        return data.results;
      },
    }),
    SlashCommandsExtension,
  ];
}
