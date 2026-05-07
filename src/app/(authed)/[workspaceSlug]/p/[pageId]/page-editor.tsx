"use client";

import { useCallback, useState } from "react";
import type { JSONContent } from "@tiptap/react";

import { Editor, type CollabSyncState } from "@/components/editor/editor";
import { usePageContent } from "@/hooks/use-page-content";
import { cn } from "@/lib/utils";

interface CollabPayload {
  url: string;
  token: string;
  expiresAt: number;
  presence: { name: string; color: string; userId: string };
}

interface Props {
  pageId: string;
  title: string;
  initialContent: object | null;
  editable: boolean;
  workspaceId: string;
  workspaceSlug: string;
  collab: CollabPayload | null;
}

export function PageEditor({
  pageId,
  title,
  initialContent,
  editable,
  workspaceId,
  workspaceSlug,
  collab,
}: Props) {
  const [titleDraft, setTitleDraft] = useState(title);
  const [renaming, setRenaming] = useState(false);
  const [syncState, setSyncState] = useState<CollabSyncState>("connecting");

  // Solo (non-collab) save path. When collab is on, the Yjs CRDT + Hocuspocus
  // server own persistence — we don't double-write contentJson here.
  const { save, saveState, lastSavedAt } = usePageContent(pageId);

  const handleSoloChange = useCallback(
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
        {collab ? (
          <CollabStatusIndicator state={syncState} editable={editable} />
        ) : (
          <SoloSaveIndicator
            state={saveState}
            lastSavedAt={lastSavedAt}
            editable={editable}
          />
        )}
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
        onChange={collab ? undefined : handleSoloChange}
        workspaceId={workspaceId}
        workspaceSlug={workspaceSlug}
        collab={
          collab
            ? {
                url: collab.url,
                token: collab.token,
                pageId,
                user: { name: collab.presence.name, color: collab.presence.color },
              }
            : null
        }
        onSyncStateChange={collab ? setSyncState : undefined}
      />
    </div>
  );
}

function SoloSaveIndicator({
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

function CollabStatusIndicator({
  state,
  editable,
}: {
  state: CollabSyncState;
  editable: boolean;
}) {
  if (!editable) return null;
  switch (state) {
    case "connected":
      return <span>Synced</span>;
    case "connecting":
      return <span>Connecting…</span>;
    case "disconnected":
      return (
        <span className="text-destructive">Disconnected — reconnecting</span>
      );
  }
}
