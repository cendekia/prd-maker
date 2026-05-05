"use client";

import { FloatingMenu, type Editor } from "@tiptap/react";
import { Plus } from "lucide-react";

interface Props {
  editor: Editor;
}

/**
 * Empty-line affordance: a "+" button to the left of the caret on empty
 * paragraphs. Clicking inserts a "/" so the slash-command menu opens.
 */
export function EditorFloatingMenu({ editor }: Props) {
  return (
    <FloatingMenu
      editor={editor}
      tippyOptions={{ duration: 100, placement: "left", offset: [0, 4] }}
      shouldShow={({ editor, state }) => {
        const { selection } = state;
        const { $from, empty } = selection;
        if (!empty) return false;
        const node = $from.parent;
        const isEmptyParagraph =
          node.type.name === "paragraph" && node.content.size === 0;
        if (!isEmptyParagraph) return false;
        if (editor.isActive("codeBlock")) return false;
        if (editor.isActive("bulletList")) return false;
        if (editor.isActive("orderedList")) return false;
        if (editor.isActive("taskList")) return false;
        return true;
      }}
    >
      <button
        type="button"
        aria-label="Insert block"
        onClick={() =>
          editor
            .chain()
            .focus()
            .insertContent("/")
            .run()
        }
        className="flex size-6 items-center justify-center rounded-[var(--radius-sm)] border bg-background text-fg-3 hover:text-fg-1 hover:bg-bg-hover shadow-[var(--shadow-xs)]"
      >
        <Plus className="size-3.5" />
      </button>
    </FloatingMenu>
  );
}
