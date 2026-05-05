"use client";

import { useCallback, useState } from "react";
import type { JSONContent } from "@tiptap/react";

import { Editor } from "@/components/editor/editor";
import { usePageContent } from "@/hooks/use-page-content";
import { cn } from "@/lib/utils";

interface Props {
  pageId: string;
  title: string;
  initialContent: object | null;
  editable: boolean;
}

export function PageEditor({ pageId, title, initialContent, editable }: Props) {
  const [titleDraft, setTitleDraft] = useState(title);
  const [renaming, setRenaming] = useState(false);

  const { save, saveState, lastSavedAt } = usePageContent(pageId);

  const handleChange = useCallback(
    (json: JSONContent) => {
      save(json);
    },
    [save],
  );

  async function commitTitle() {
    const next = titleDraft.trim() || "Untitled";
    if (next === title) return;
    setRenaming(true);
    try {
      // Use the page-level PATCH endpoint that doesn't need workspaceId, by
      // reading the workspace via the tree mutation key.
      const res = await fetch(`/api/pages/${pageId}/title`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Rename failed: ${res.status}`);
      }
    } catch (e) {
      console.error(e);
      setTitleDraft(title);
    } finally {
      setRenaming(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[var(--content-max-width)] px-6 py-12">
      <div className="mb-2 flex items-center gap-3 text-[12px] text-fg-3">
        <SaveIndicator state={saveState} lastSavedAt={lastSavedAt} editable={editable} />
        {!editable ? (
          <span className="rounded-full bg-bg-muted px-2 py-0.5 text-fg-2">
            Read-only
          </span>
        ) : null}
      </div>
      <input
        value={titleDraft}
        onChange={(e) => setTitleDraft(e.target.value)}
        onBlur={() => {
          if (editable) commitTitle();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        readOnly={!editable || renaming}
        placeholder="Untitled"
        className="mb-6 block w-full bg-transparent text-[36px] font-semibold leading-[44px] tracking-[-0.02em] text-fg-1 placeholder:text-fg-4 focus:outline-none"
      />

      <Editor
        initialContent={initialContent as JSONContent | null}
        editable={editable}
        onChange={handleChange}
      />
    </div>
  );
}

function SaveIndicator({
  state,
  lastSavedAt,
  editable,
}: {
  state: ReturnType<typeof usePageContent>["saveState"];
  lastSavedAt: Date | null;
  editable: boolean;
}) {
  if (!editable) return null;
  let label: string;
  switch (state) {
    case "saving":
      label = "Saving…";
      break;
    case "saved":
      label = lastSavedAt
        ? `Saved at ${lastSavedAt.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}`
        : "Saved";
      break;
    case "error":
      label = "Couldn’t save — retrying";
      break;
    default:
      label = " ";
  }
  return (
    <span className={cn(state === "error" && "text-destructive")}>{label}</span>
  );
}
