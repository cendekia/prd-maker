"use client";

import type { Editor, Range } from "@tiptap/core";
import {
  CheckSquare,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  List,
  ListOrdered,
  Minus,
  Quote,
  Table as TableIcon,
  Text,
  type LucideIcon,
} from "lucide-react";

export interface SlashCommandItem {
  title: string;
  description: string;
  keywords?: string[];
  icon: LucideIcon;
  command: (props: { editor: Editor; range: Range }) => void;
}

export const defaultSlashItems: SlashCommandItem[] = [
  {
    title: "Text",
    description: "Plain paragraph",
    keywords: ["paragraph", "p"],
    icon: Text,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    title: "Heading 1",
    description: "Section heading",
    keywords: ["h1", "title"],
    icon: Heading1,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run(),
  },
  {
    title: "Heading 2",
    description: "Subsection heading",
    keywords: ["h2"],
    icon: Heading2,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run(),
  },
  {
    title: "Heading 3",
    description: "Smaller heading",
    keywords: ["h3"],
    icon: Heading3,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run(),
  },
  {
    title: "Bulleted list",
    description: "Unordered list",
    keywords: ["ul", "bullet"],
    icon: List,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: "Numbered list",
    description: "Ordered list",
    keywords: ["ol", "ordered"],
    icon: ListOrdered,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: "Task list",
    description: "Checklist with tickboxes",
    keywords: ["todo", "checklist", "task"],
    icon: CheckSquare,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    title: "Quote",
    description: "Block quote",
    keywords: ["blockquote"],
    icon: Quote,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setBlockquote().run(),
  },
  {
    title: "Code block",
    description: "Fenced code block",
    keywords: ["pre", "fence"],
    icon: Code,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: "Divider",
    description: "Horizontal rule",
    keywords: ["hr", "rule", "separator"],
    icon: Minus,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    title: "Table",
    description: "3×3 table with header row",
    keywords: ["grid"],
    icon: TableIcon,
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
  {
    title: "Image",
    description: "Upload an image",
    keywords: ["picture", "img"],
    icon: ImageIcon,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        // Step 10 stub — real upload (S3 signed URL) lands later.
        const reader = new FileReader();
        reader.onload = () => {
          const src = reader.result;
          if (typeof src === "string") {
            editor.chain().focus().setImage({ src }).run();
          }
        };
        reader.readAsDataURL(file);
      };
      input.click();
    },
  },
];
