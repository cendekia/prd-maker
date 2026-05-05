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

import { SlashCommandsExtension } from "./slash-command";

const lowlight = createLowlight(common);

export function buildExtensions() {
  return [
    StarterKit.configure({
      // Use code-block-lowlight for syntax highlighting instead.
      codeBlock: false,
      heading: { levels: [1, 2, 3] },
      // Built-in horizontalRule, blockquote, lists are kept (default).
      // Cmd-Z / Cmd-Shift-Z work via History (StarterKit default).
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
    Table.configure({ resizable: true, HTMLAttributes: { class: "tiptap-table" } }),
    TableRow,
    TableHeader,
    TableCell,
    SlashCommandsExtension,
  ];
}
