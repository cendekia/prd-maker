"use client";

import { BubbleMenu, type Editor } from "@tiptap/react";
import { Bold, Code, Italic, Link as LinkIcon, MessageSquarePlus, Strikethrough } from "lucide-react";

import { cn } from "@/lib/utils";

interface Props {
  editor: Editor;
}

export function EditorBubbleMenu({ editor }: Props) {
  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{ duration: 100, placement: "top" }}
      className="flex items-center gap-px rounded-[var(--radius-md)] border bg-popover p-1 shadow-[var(--shadow-md)]"
      shouldShow={({ editor, from, to }) => {
        if (from === to) return false;
        // Hide inside code blocks (keyboard formatting doesn't apply).
        if (editor.isActive("codeBlock")) return false;
        return true;
      }}
    >
      <ToolButton
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        label="Bold"
      >
        <Bold className="size-3.5" />
      </ToolButton>
      <ToolButton
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        label="Italic"
      >
        <Italic className="size-3.5" />
      </ToolButton>
      <ToolButton
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        label="Strikethrough"
      >
        <Strikethrough className="size-3.5" />
      </ToolButton>
      <ToolButton
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
        label="Inline code"
      >
        <Code className="size-3.5" />
      </ToolButton>
      <span className="mx-0.5 h-4 w-px bg-border" />
      <ToolButton
        active={editor.isActive("link")}
        onClick={() => {
          const prev = editor.getAttributes("link").href as string | undefined;
          const url = window.prompt("Link URL", prev ?? "https://");
          if (url === null) return;
          if (url === "") {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
            return;
          }
          editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
        }}
        label="Link"
      >
        <LinkIcon className="size-3.5" />
      </ToolButton>
      <span className="mx-0.5 h-4 w-px bg-border" />
      <ToolButton
        active={editor.isActive("comment")}
        onClick={() => {
          const { from, to } = editor.state.selection;
          if (from === to) return;
          // Hand off to the page-editor: it opens the rail and shows a
          // composer pinned to this range. On submit the rail dispatches
          // `prdmaker:comment-applied` so the editor can mark the text.
          document.dispatchEvent(
            new CustomEvent("prdmaker:comment-start", { detail: { from, to } }),
          );
        }}
        label="Comment on selection"
      >
        <MessageSquarePlus className="size-3.5" />
      </ToolButton>
    </BubbleMenu>
  );
}

function ToolButton({
  children,
  active,
  onClick,
  label,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex size-7 items-center justify-center rounded-[var(--radius-sm)] text-fg-2 transition-colors",
        active ? "bg-bg-active text-fg-1" : "hover:bg-bg-hover hover:text-fg-1",
      )}
    >
      {children}
    </button>
  );
}
