"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor as TipTapEditor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/react";
import { History as HistoryIcon, MessageSquare } from "lucide-react";

import { CommentsRail, type PendingAnchor } from "@/components/comments/comments-rail";
import { Editor, type CollabSyncState } from "@/components/editor/editor";
import { AgilePropertiesBar } from "@/components/page/agile-properties-bar";
import { FeatureLinksField } from "@/components/page/feature-links-field";
import { ImpactCard } from "@/components/agent/impact-card";
import type {
  ImpactAnalysisItem,
  ImpactFeatureMeta,
  PageFeatureItem,
} from "@/lib/agent/types";
import { ExportMenu } from "@/components/page/export-menu";
import { StartFromTemplate } from "@/components/page/start-from-template";
import { Button } from "@/components/ui/button";
import { HistoryDrawer } from "@/components/version-history/history-drawer";
import { useAutoSnapshot } from "@/hooks/use-auto-snapshot";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { usePageContent } from "@/hooks/use-page-content";
import { applyAiEditToPage } from "@/lib/ai-apply";
import type { PageAgileInitial } from "@/lib/agile";
import { cn } from "@/lib/utils";

import { PublishPopover } from "./components/publish-popover";

interface CollabPayload {
  url: string;
  token: string;
  expiresAt: number;
  presence: {
    userId: string;
    name: string;
    color: string;
    avatarUrl: string | null;
  };
}

interface Props {
  pageId: string;
  title: string;
  initialContent: object | null;
  editable: boolean;
  workspaceId: string;
  workspaceSlug: string;
  currentUserId: string;
  isOwner: boolean;
  collab: CollabPayload | null;
  isPublished: boolean;
  publicSlug: string | null;
  publicBaseUrl: string;
  agile: PageAgileInitial;
  initialPageFeatures: PageFeatureItem[];
  initialImpactAnalyses: ImpactAnalysisItem[];
  initialImpactFeatureMeta: Record<string, ImpactFeatureMeta>;
}

export function PageEditor({
  pageId,
  title,
  initialContent,
  editable,
  workspaceId,
  workspaceSlug,
  currentUserId,
  isOwner,
  collab,
  isPublished,
  publicSlug,
  publicBaseUrl,
  agile,
  initialPageFeatures,
  initialImpactAnalyses,
  initialImpactFeatureMeta,
}: Props) {
  const [titleDraft, setTitleDraft] = useState(title);
  const [renaming, setRenaming] = useState(false);
  const [pageFeatures, setPageFeatures] = useState(initialPageFeatures);
  const [syncState, setSyncState] = useState<CollabSyncState>("connecting");
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pendingAnchor, setPendingAnchor] = useState<PendingAnchor | null>(null);

  const isMobile = useIsMobile();
  // On mobile the editor is read-only and comment authoring is disabled — we
  // never grant edit below the breakpoint, even with permission.
  const effectiveEditable = editable && !isMobile;

  // History is an editing affordance; close it if we drop to mobile.
  useEffect(() => {
    if (isMobile) setHistoryOpen(false);
  }, [isMobile]);

  // Bubble menu Comment button -> open rail with selection-bound composer.
  useEffect(() => {
    function onStart(e: Event) {
      const detail = (e as CustomEvent<PendingAnchor>).detail;
      if (!detail) return;
      setPendingAnchor(detail);
      setCommentsOpen(true);
    }
    document.addEventListener("prdmaker:comment-start", onStart);
    return () => document.removeEventListener("prdmaker:comment-start", onStart);
  }, []);

  // Snapshot orchestration. We hold a ref to the live editor so the periodic
  // auto-snapshot can read the freshest JSON (works in both solo + collab
  // modes — `onEditor` fires once the editor mounts in either path).
  const editorRef = useRef<TipTapEditor | null>(null);
  const { markDirty, snapshotNow } = useAutoSnapshot({
    pageId,
    enabled: effectiveEditable,
    getContentJson: () => editorRef.current?.getJSON() ?? null,
  });

  // AI panel "Apply to page" -> snapshot-then-apply into this editor (Step 21).
  // The panel lives in a sibling subtree, so it dispatches an event and we run
  // the orchestration here where the live editor instance is in scope.
  useEffect(() => {
    function onApply(e: Event) {
      const detail = (
        e as CustomEvent<{ requestId: string; pageId: string; markdown: string }>
      ).detail;
      if (!detail || detail.pageId !== pageId) return;
      const respond = (ok: boolean, error?: string) =>
        document.dispatchEvent(
          new CustomEvent("prdmaker:ai-apply-done", {
            detail: { requestId: detail.requestId, ok, error },
          }),
        );
      if (!effectiveEditable) {
        respond(false, "This page is read-only.");
        return;
      }
      applyAiEditToPage({
        pageId,
        markdown: detail.markdown,
        editor: editorRef.current,
      })
        .then((r) => {
          // On success, snapshot the freshly applied content (MANUAL): persists
          // it to contentJson/contentText and, via the Step 49 hook, queues a
          // re-extraction so the agent maps the new content (Step 53).
          if (r.ok) void snapshotNow("MANUAL");
          respond(r.ok, r.error);
        })
        .catch((err) =>
          respond(false, err instanceof Error ? err.message : "Apply failed."),
        );
    }
    document.addEventListener("prdmaker:ai-apply", onApply);
    return () => document.removeEventListener("prdmaker:ai-apply", onApply);
  }, [pageId, effectiveEditable, snapshotNow]);

  // Also held as state so children that react to the live doc (the
  // start-from-template affordance) re-render once the editor exists.
  const [editorInstance, setEditorInstance] = useState<TipTapEditor | null>(
    null,
  );

  const handleEditorInstance = useCallback(
    (editor: TipTapEditor | null) => {
      editorRef.current = editor;
      setEditorInstance(editor);
      if (!editor) return;
      const onUpdate = () => markDirty();
      editor.on("update", onUpdate);
      // Cleanup is handled by the editor instance itself when it's destroyed —
      // calling `.off` here would race with React's strict-mode double-effect.
    },
    [markDirty],
  );

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
    <div className="flex h-full">
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-[var(--content-max-width)] px-6 py-12">
          <div className="mb-2 flex flex-wrap items-center gap-3 gap-y-2 text-[12px] text-fg-3">
            {collab ? (
              <CollabStatusIndicator state={syncState} editable={effectiveEditable} />
            ) : (
              <SoloSaveIndicator
                state={saveState}
                lastSavedAt={lastSavedAt}
                editable={effectiveEditable}
              />
            )}
            {!effectiveEditable ? (
              <span className="rounded-full bg-bg-muted px-2 py-0.5 text-fg-2">
                Read-only
              </span>
            ) : null}
            <div className="ml-auto flex items-center gap-1.5">
              <ExportMenu
                pageId={pageId}
                getContentJson={() => editorRef.current?.getJSON() ?? null}
              />
              <PublishPopover
                pageId={pageId}
                pageTitle={title}
                initialIsPublished={isPublished}
                initialPublicSlug={publicSlug}
                publicBaseUrl={publicBaseUrl}
                canPublish={effectiveEditable}
                getContentJson={() => editorRef.current?.getJSON() ?? null}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "hidden gap-1.5 md:inline-flex",
                historyOpen && "bg-bg-active text-fg-1",
              )}
              onClick={() => {
                setHistoryOpen((o) => !o);
                if (!historyOpen) setCommentsOpen(false);
              }}
              aria-pressed={historyOpen}
              aria-label="Toggle version history"
            >
              <HistoryIcon className="size-3.5" />
              History
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "gap-1.5",
                commentsOpen && "bg-bg-active text-fg-1",
              )}
              onClick={() => {
                setCommentsOpen((o) => !o);
                if (!commentsOpen) setHistoryOpen(false);
              }}
              aria-pressed={commentsOpen}
              aria-label="Toggle comments"
            >
              <MessageSquare className="size-3.5" />
              Comments
            </Button>
          </div>
          <input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              if (effectiveEditable) commitTitle();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.currentTarget as HTMLInputElement).blur();
              }
            }}
            readOnly={!effectiveEditable || renaming}
            placeholder="Untitled"
            className="mb-6 block w-full bg-transparent text-[36px] font-semibold leading-[44px] tracking-[-0.02em] text-fg-1 placeholder:text-fg-4 focus:outline-none"
          />

          <AgilePropertiesBar
            pageId={pageId}
            workspaceId={workspaceId}
            editable={effectiveEditable}
            initial={agile}
            trailing={
              <FeatureLinksField
                pageId={pageId}
                workspaceId={workspaceId}
                editable={effectiveEditable}
                value={pageFeatures}
                onChange={setPageFeatures}
              />
            }
          />

          <ImpactCard
            pageId={pageId}
            workspaceSlug={workspaceSlug}
            editable={effectiveEditable}
            initialAnalyses={initialImpactAnalyses}
            initialFeatureMeta={initialImpactFeatureMeta}
            hasModifies={pageFeatures.some((f) => f.role === "MODIFIES")}
          />

          <StartFromTemplate
            pageId={pageId}
            workspaceId={workspaceId}
            editor={editorInstance}
            editable={effectiveEditable}
            // A blank page (no saved content) is trustworthy immediately; a
            // collab page with saved content only after the Y.Doc has synced
            // and been seeded — before that the live doc is transiently empty.
            ready={
              initialContent == null || !collab || syncState === "connected"
            }
            onApplied={() => void snapshotNow("MANUAL")}
          />

          <Editor
            initialContent={initialContent as JSONContent | null}
            editable={effectiveEditable}
            onChange={collab ? undefined : handleSoloChange}
            workspaceId={workspaceId}
            workspaceSlug={workspaceSlug}
            collab={
              collab
                ? {
                    url: collab.url,
                    token: collab.token,
                    pageId,
                    user: {
                      userId: collab.presence.userId,
                      name: collab.presence.name,
                      color: collab.presence.color,
                      avatarUrl: collab.presence.avatarUrl,
                    },
                  }
                : null
            }
            onSyncStateChange={collab ? setSyncState : undefined}
            onEditor={handleEditorInstance}
          />
        </div>
      </div>
      {historyOpen ? (
        <HistoryDrawer
          pageId={pageId}
          getCurrentJson={() => editorRef.current?.getJSON() ?? null}
          canRestore={effectiveEditable}
          onRestored={(snapshotJson) => {
            const editor = editorRef.current;
            if (editor && snapshotJson) {
              // setContent flows through y-prosemirror into the shared Y.Doc
              // (when collab is on) and broadcasts to all viewers via
              // Hocuspocus. In solo mode it triggers the normal save path.
              editor.commands.setContent(
                snapshotJson as JSONContent,
                true,
              );
            }
            setHistoryOpen(false);
          }}
          onClose={() => setHistoryOpen(false)}
        />
      ) : null}
      {commentsOpen ? (
        <CommentsRail
          pageId={pageId}
          workspaceId={workspaceId}
          currentUserId={currentUserId}
          isOwner={isOwner}
          readOnly={isMobile}
          onClose={() => {
            setCommentsOpen(false);
            setPendingAnchor(null);
          }}
          pendingAnchor={pendingAnchor}
          onPendingResolved={() => setPendingAnchor(null)}
        />
      ) : null}
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
