"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import { HocuspocusProvider, type WebSocketStatus } from "@hocuspocus/provider";
import * as Y from "yjs";

import { usePresenceController } from "@/hooks/use-presence";
import { cn } from "@/lib/utils";

import { EditorBubbleMenu } from "./bubble-menu";
import { buildExtensions } from "./extensions";
import { EditorFloatingMenu } from "./floating-menu";
import type { Editor as TipTapEditor } from "@tiptap/core";

import "./editor.css";

/**
 * Wire up the page-level comment events the bubble menu + rail dispatch:
 *   - prdmaker:comment-applied { commentId, from, to } — paint the mark
 *   - prdmaker:comment-focus   { commentId }           — scroll to mark
 *   - prdmaker:comment-removed { commentId }           — strip the mark
 *
 * Editor-side concerns only — the rail handles its own create/click events.
 */
function useCommentEditorEvents(editor: TipTapEditor | null) {
  useEffect(() => {
    if (!editor) return;
    function onApplied(e: Event) {
      const detail = (e as CustomEvent<{ commentId: string; from: number; to: number }>).detail;
      if (!detail?.commentId) return;
      editor!
        .chain()
        .setTextSelection({ from: detail.from, to: detail.to })
        .setComment(detail.commentId)
        .run();
    }
    function onFocus(e: Event) {
      const detail = (e as CustomEvent<{ commentId: string }>).detail;
      if (!detail?.commentId) return;
      const dom = editor!.view.dom.querySelector(
        `[data-comment-id="${detail.commentId}"]`,
      ) as HTMLElement | null;
      dom?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    function onRemoved(e: Event) {
      const detail = (e as CustomEvent<{ commentId: string }>).detail;
      if (!detail?.commentId) return;
      editor!.chain().unsetComment(detail.commentId).run();
    }
    document.addEventListener("prdmaker:comment-applied", onApplied);
    document.addEventListener("prdmaker:comment-focus", onFocus);
    document.addEventListener("prdmaker:comment-removed", onRemoved);
    return () => {
      document.removeEventListener("prdmaker:comment-applied", onApplied);
      document.removeEventListener("prdmaker:comment-focus", onFocus);
      document.removeEventListener("prdmaker:comment-removed", onRemoved);
    };
  }, [editor]);

  // Click on a comment-marked range -> open thread in the rail.
  useEffect(() => {
    if (!editor) return;
    function onClick(e: Event) {
      const target = e.target as HTMLElement | null;
      const span = target?.closest("[data-comment-id]") as HTMLElement | null;
      if (!span) return;
      const commentId = span.getAttribute("data-comment-id");
      if (!commentId) return;
      document.dispatchEvent(
        new CustomEvent("prdmaker:comment-click", { detail: { commentId } }),
      );
    }
    const dom = editor.view.dom;
    dom.addEventListener("click", onClick);
    return () => dom.removeEventListener("click", onClick);
  }, [editor]);
}

export type CollabSyncState = "connecting" | "connected" | "disconnected";

export interface CollabConfig {
  /** Browser-reachable Hocuspocus WebSocket URL (e.g. ws://localhost:1234). */
  url: string;
  /** Short-lived JWT minted by /api/collab/token. */
  token: string;
  /** The page id is also the Hocuspocus document name. */
  pageId: string;
  /** Local user — broadcast via Yjs awareness for presence cursors and the
   * top-bar avatar stack. */
  user: {
    userId: string;
    name: string;
    color: string;
    avatarUrl: string | null;
  };
}

interface Props {
  /** Initial document JSON. Used when collab is off, OR as a one-time seed for
   * a brand-new collab doc that has no persisted Yjs state yet. */
  initialContent: JSONContent | null;
  /** Whether the editor is editable. */
  editable?: boolean;
  /** Called on every doc change. Suppressed when collab is on (Yjs persists). */
  onChange?: (json: JSONContent) => void;
  /** Workspace context for [[Page]] suggestions and chip hrefs. */
  workspaceId: string;
  workspaceSlug: string;
  className?: string;
  /** When provided, the editor binds to a Yjs document via Hocuspocus and
   * disables the local JSON save path. */
  collab?: CollabConfig | null;
  /** Notified as the WebSocket connection state changes. */
  onSyncStateChange?: (state: CollabSyncState) => void;
  /**
   * Receives the live TipTap editor instance after mount, and `null` on
   * unmount. Used by the page host to drive snapshots, programmatic
   * commands, etc. without re-creating the editor.
   */
  onEditor?: (editor: TipTapEditor | null) => void;
}

const EMPTY_DOC: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export function Editor(props: Props) {
  if (props.collab) {
    return <CollabEditor key={props.collab.pageId} {...props} collab={props.collab} />;
  }
  return <SoloEditor {...props} />;
}

/* -------------------------------------------------------------------- */
/* Solo (no collab) — original behavior, kept for read-only previews     */
/* and any future surface that doesn't want a WS connection.             */
/* -------------------------------------------------------------------- */

function SoloEditor({
  initialContent,
  editable = true,
  onChange,
  workspaceId,
  workspaceSlug,
  className,
  onEditor,
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
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class: "prose prose-sm max-w-none focus:outline-none",
        },
      },
      onUpdate: ({ editor }) => {
        onChangeRef.current?.(editor.getJSON());
      },
    },
    [],
  );

  useCommentEditorEvents(editor);

  useEffect(() => {
    onEditor?.(editor ?? null);
    return () => onEditor?.(null);
  }, [editor, onEditor]);

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

/* -------------------------------------------------------------------- */
/* Collab — Hocuspocus provider + Yjs binding via @tiptap/extension-     */
/* collaboration. The Y.Doc is the source of truth; we never call        */
/* onChange in this path.                                                */
/* -------------------------------------------------------------------- */

function CollabEditor({
  initialContent,
  editable = true,
  workspaceId,
  workspaceSlug,
  className,
  collab,
  onSyncStateChange,
  onEditor,
}: Props & { collab: CollabConfig }) {
  // One Y.Doc + provider per page. The outer <Editor> remounts via key=pageId
  // when navigating between pages, so we don't need to handle pageId changes
  // inside this component.
  const ydoc = useMemo(() => new Y.Doc(), []);
  const [synced, setSynced] = useState(false);
  const presence = usePresenceController();

  const provider = useMemo(() => {
    return new HocuspocusProvider({
      url: collab.url,
      name: collab.pageId,
      document: ydoc,
      token: collab.token,
      // We attach awareness state once the editor is created, below.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ydoc]);

  // Publish the active provider + local user id to the PresenceProvider so the
  // top-bar avatar stack can subscribe to the same awareness. Cleared on
  // unmount BEFORE the provider is destroyed below.
  useEffect(() => {
    presence.setSelfUserId(collab.user.userId);
    presence.setProvider(provider);
    return () => {
      presence.setProvider(null);
      presence.setSelfUserId(null);
    };
  }, [presence, provider, collab.user.userId]);

  // Forward connection lifecycle to the host so the title bar can show a
  // "Synced" / "Connecting…" indicator.
  useEffect(() => {
    function handleStatus({ status }: { status: WebSocketStatus }) {
      const mapped: CollabSyncState =
        status === "connected"
          ? "connected"
          : status === "connecting"
            ? "connecting"
            : "disconnected";
      onSyncStateChange?.(mapped);
    }
    function handleSynced() {
      setSynced(true);
    }
    provider.on("status", handleStatus);
    provider.on("synced", handleSynced);
    return () => {
      provider.off("status", handleStatus);
      provider.off("synced", handleSynced);
    };
  }, [provider, onSyncStateChange]);

  // Tear down on unmount.
  useEffect(() => {
    return () => {
      provider.destroy();
      ydoc.destroy();
    };
  }, [provider, ydoc]);

  const editor = useEditor(
    {
      extensions: [
        ...buildExtensions({ workspaceId, workspaceSlug, withHistory: false }),
        Collaboration.configure({ document: ydoc }),
        CollaborationCursor.configure({
          provider,
          // Extra fields (userId, avatarUrl) are broadcast via awareness even
          // though the cursor extension itself only reads {name, color}.
          user: {
            userId: collab.user.userId,
            name: collab.user.name,
            color: collab.user.color,
            avatarUrl: collab.user.avatarUrl,
          },
        }),
      ],
      editable,
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class: "prose prose-sm max-w-none focus:outline-none",
        },
      },
    },
    [provider],
  );

  // First-load seed: if the page has legacy contentJson but no yDocState yet,
  // the synced Y.Doc will arrive empty. Plant the JSON locally; Yjs propagates
  // it to the server and any other clients. Subsequent loads skip this branch.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!editor || !synced || seededRef.current) return;
    if (!initialContent) {
      seededRef.current = true;
      return;
    }
    if (editor.isEmpty) {
      editor.commands.setContent(initialContent, false);
    }
    seededRef.current = true;
  }, [editor, synced, initialContent]);

  useCommentEditorEvents(editor);

  useEffect(() => {
    onEditor?.(editor ?? null);
    return () => onEditor?.(null);
  }, [editor, onEditor]);

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
