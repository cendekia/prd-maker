"use client";

import { useEffect, useRef } from "react";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";

import { cn } from "@/lib/utils";

import { EditorBubbleMenu } from "./bubble-menu";
import { buildExtensions } from "./extensions";
import { EditorFloatingMenu } from "./floating-menu";

import "./editor.css";

interface Props {
  /** Initial document JSON. Null/empty → fresh paragraph. */
  initialContent: JSONContent | null;
  /** Whether the editor is editable. */
  editable?: boolean;
  /** Called on every doc change (debounce upstream). */
  onChange?: (json: JSONContent) => void;
  /** Workspace context for [[Page]] suggestions and chip hrefs. */
  workspaceId: string;
  workspaceSlug: string;
  className?: string;
}

const EMPTY_DOC: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export function Editor({
  initialContent,
  editable = true,
  onChange,
  workspaceId,
  workspaceSlug,
  className,
}: Props) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor(
    {
      extensions: buildExtensions({ workspaceId, workspaceSlug }),
      content: initialContent ?? EMPTY_DOC,
      editable,
      // Avoid hydration warning: TipTap renders client-side after mount.
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class:
            "prose prose-sm max-w-none focus:outline-none",
        },
      },
      onUpdate: ({ editor }) => {
        onChangeRef.current?.(editor.getJSON());
      },
    },
    [],
  );

  if (!editor) {
    return (
      <div className={cn("editor-host", className)}>
        <div className="text-fg-3 text-[14px]">Loading editor…</div>
      </div>
    );
  }

  return (
    <div className={cn("editor-host", className)}>
      <EditorBubbleMenu editor={editor} />
      <EditorFloatingMenu editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
