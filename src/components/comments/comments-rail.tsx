"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageSquare, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { CommentInput } from "./comment-input";
import { CommentThread, type CommentDto } from "./comment-thread";

export interface PendingAnchor {
  from: number;
  to: number;
}

interface Props {
  pageId: string;
  workspaceId: string;
  currentUserId: string;
  isOwner: boolean;
  /** Optional close button — caller controls visibility. */
  onClose?: () => void;
  /** Initial comment id to highlight + scroll to (e.g. clicked from editor). */
  initialFocusId?: string | null;
  /** Selection-bound composer mode triggered by the editor's bubble-menu. */
  pendingAnchor?: PendingAnchor | null;
  /** Called when the pending composer is dismissed/submitted so the host can
   *  clear its `pendingAnchor` state. */
  onPendingResolved?: () => void;
  /** Read-only mode (mobile): hide all composers and per-thread authoring
   *  actions; threads stay viewable. */
  readOnly?: boolean;
  className?: string;
}

/**
 * Right-of-editor drawer listing every comment thread on the page.
 * Threads are ordered by their anchor's document position when known,
 * falling back to creation order for page-level comments.
 *
 * Listens for two custom events on `document`:
 *   - `prdmaker:comment-click`  { commentId }   — focus a thread
 *   - `prdmaker:comment-create` { commentId }   — refresh after editor adds one
 */
export function CommentsRail({
  pageId,
  workspaceId,
  currentUserId,
  isOwner,
  onClose,
  initialFocusId,
  pendingAnchor,
  onPendingResolved,
  readOnly = false,
  className,
}: Props) {
  const [comments, setComments] = useState<CommentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(initialFocusId ?? null);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/pages/${pageId}/comments`);
      if (!res.ok) return;
      const data = (await res.json()) as { comments: CommentDto[] };
      setComments(data.comments);
    } finally {
      setLoading(false);
    }
  }, [pageId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Re-fetch when the editor adds or focuses a comment.
  useEffect(() => {
    function onCreate(e: Event) {
      refetch();
      const detail = (e as CustomEvent<{ commentId: string }>).detail;
      if (detail?.commentId) setFocusedId(detail.commentId);
    }
    function onClick(e: Event) {
      const detail = (e as CustomEvent<{ commentId: string }>).detail;
      if (detail?.commentId) setFocusedId(detail.commentId);
    }
    document.addEventListener("prdmaker:comment-create", onCreate);
    document.addEventListener("prdmaker:comment-click", onClick);
    return () => {
      document.removeEventListener("prdmaker:comment-create", onCreate);
      document.removeEventListener("prdmaker:comment-click", onClick);
    };
  }, [refetch]);

  // Scroll the focused thread into view when it changes.
  useEffect(() => {
    if (!focusedId) return;
    const el = document.querySelector(
      `[data-comment-thread="${focusedId}"]`,
    ) as HTMLElement | null;
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusedId, comments]);

  const grouped = useMemo(() => groupThreads(comments, showResolved), [
    comments,
    showResolved,
  ]);

  async function postComment(
    body: string,
    parentId?: string | null,
    anchor?: PendingAnchor | null,
  ) {
    const res = await fetch(`/api/pages/${pageId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, parentId: parentId ?? null, anchor: anchor ?? null }),
    });
    if (!res.ok) throw new Error("Failed to post comment");
    const { comment } = (await res.json()) as { comment: CommentDto };
    await refetch();
    // If the comment had an anchor, paint the editor mark and focus the thread.
    if (anchor) {
      document.dispatchEvent(
        new CustomEvent("prdmaker:comment-applied", {
          detail: { commentId: comment.id, from: anchor.from, to: anchor.to },
        }),
      );
    }
    setFocusedId(comment.id);
    return comment;
  }

  async function patchComment(id: string, payload: { resolved?: boolean }) {
    const res = await fetch(`/api/pages/${pageId}/comments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to update comment");
    await refetch();
  }

  async function deleteComment(id: string) {
    const res = await fetch(`/api/pages/${pageId}/comments/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete comment");
    await refetch();
  }

  const focusEditorMark = useCallback((commentId: string) => {
    document.dispatchEvent(
      new CustomEvent("prdmaker:comment-focus", { detail: { commentId } }),
    );
  }, []);

  return (
    <aside
      className={cn(
        "pm-slide-in-right",
        // Desktop: a 320px side panel. Mobile: a full-screen overlay sheet
        // (`inset-0` gives full width without a competing fixed width).
        "flex flex-col border-l bg-bg-subtle",
        "max-md:fixed max-md:inset-0 max-md:z-30 max-md:border-l-0",
        "md:w-[320px] md:shrink-0",
        className,
      )}
      aria-label="Comments"
    >
      <header className="flex h-[var(--topbar-height)] items-center gap-2 border-b bg-background px-3">
        <MessageSquare className="size-4 text-fg-3" />
        <span className="text-[13px] font-medium text-fg-1">Comments</span>
        <span className="text-[11px] text-fg-3">
          {comments.filter((c) => !c.parentId && !c.resolvedAt).length}
        </span>
        <button
          type="button"
          onClick={() => setShowResolved((v) => !v)}
          className="ml-auto rounded-full px-2 py-0.5 text-[11px] text-fg-3 hover:bg-bg-hover hover:text-fg-1"
        >
          {showResolved ? "Hide resolved" : "Show resolved"}
        </button>
        {onClose ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close comments"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        ) : null}
      </header>

      <div className="flex-1 overflow-y-auto p-3">
        {pendingAnchor && !readOnly ? (
          <div className="mb-3 rounded-[var(--radius-md)] border border-accent-300 bg-accent-50/40 p-3">
            <div className="mb-2 text-[11px] font-medium text-fg-2">
              Comment on selection
            </div>
            <CommentInput
              workspaceId={workspaceId}
              autoFocus
              submitLabel="Comment"
              placeholder="What do you think?"
              onCancel={() => onPendingResolved?.()}
              onSubmit={async (body) => {
                await postComment(body, null, pendingAnchor);
                onPendingResolved?.();
                return;
              }}
            />
          </div>
        ) : null}
        {loading ? (
          <div className="text-[12px] text-fg-3">Loading…</div>
        ) : grouped.length === 0 && !pendingAnchor ? (
          <div className="rounded-[var(--radius-md)] border border-dashed p-4 text-center text-[12px] text-fg-3">
            {readOnly
              ? "No comments yet."
              : "No comments yet. Select text in the editor and click the comment icon, or leave a page-level comment below."}
          </div>
        ) : grouped.length > 0 ? (
          <div className="space-y-3">
            {grouped.map(({ parent, replies }) => (
              <CommentThread
                key={parent.id}
                workspaceId={workspaceId}
                parent={parent}
                replies={replies}
                currentUserId={currentUserId}
                isOwner={isOwner}
                readOnly={readOnly}
                highlighted={parent.id === focusedId}
                onReply={async (parentId, body) => {
                  await postComment(body, parentId);
                }}
                onResolveToggle={(id, resolved) => patchComment(id, { resolved })}
                onDelete={deleteComment}
                onFocusInEditor={focusEditorMark}
              />
            ))}
          </div>
        ) : null}
      </div>

      {!readOnly ? (
        <div className="border-t bg-background p-3">
          <CommentInput
            workspaceId={workspaceId}
            placeholder="Comment on the whole page…"
            submitLabel="Post"
            onSubmit={async (body) => {
              await postComment(body, null);
            }}
          />
        </div>
      ) : null}
    </aside>
  );
}

interface ThreadGroup {
  parent: CommentDto;
  replies: CommentDto[];
}

function groupThreads(comments: CommentDto[], showResolved: boolean): ThreadGroup[] {
  const parents = comments.filter((c) => !c.parentId);
  const repliesByParent = new Map<string, CommentDto[]>();
  for (const c of comments) {
    if (c.parentId) {
      const list = repliesByParent.get(c.parentId) ?? [];
      list.push(c);
      repliesByParent.set(c.parentId, list);
    }
  }
  return parents
    .filter((p) => showResolved || !p.resolvedAt)
    .sort((a, b) => {
      const aFrom = a.anchor?.from ?? Number.POSITIVE_INFINITY;
      const bFrom = b.anchor?.from ?? Number.POSITIVE_INFINITY;
      if (aFrom !== bFrom) return aFrom - bFrom;
      return a.createdAt.localeCompare(b.createdAt);
    })
    .map((parent) => ({
      parent,
      replies: (repliesByParent.get(parent.id) ?? []).sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      ),
    }));
}
