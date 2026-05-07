"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import { HocuspocusProvider, type WebSocketStatus } from "@hocuspocus/provider";
import * as Y from "yjs";

import { cn } from "@/lib/utils";

import { EditorBubbleMenu } from "./bubble-menu";
import { buildExtensions } from "./extensions";
import { EditorFloatingMenu } from "./floating-menu";

import "./editor.css";

export type CollabSyncState = "connecting" | "connected" | "disconnected";

export interface CollabConfig {
  /** Browser-reachable Hocuspocus WebSocket URL (e.g. ws://localhost:1234). */
  url: string;
  /** Short-lived JWT minted by /api/collab/token. */
  token: string;
  /** The page id is also the Hocuspocus document name. */
  pageId: string;
  /** Local user — broadcast via Yjs awareness for presence cursors. */
  user: { name: string; color: string };
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
}: Props & { collab: CollabConfig }) {
  // One Y.Doc + provider per page. The outer <Editor> remounts via key=pageId
  // when navigating between pages, so we don't need to handle pageId changes
  // inside this component.
  const ydoc = useMemo(() => new Y.Doc(), []);
  const [synced, setSynced] = useState(false);

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
          user: { name: collab.user.name, color: collab.user.color },
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
