"use client";

import { useState } from "react";
import { Check, MessageSquare, MoreHorizontal, Trash2, Undo2 } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { CommentBody } from "./comment-body";
import { CommentInput } from "./comment-input";

export interface CommentDto {
  id: string;
  pageId: string;
  parentId: string | null;
  body: string;
  anchor: { from: number; to: number } | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string | null; email: string; image: string | null };
}

interface Props {
  workspaceId: string;
  parent: CommentDto;
  replies: CommentDto[];
  currentUserId: string;
  isOwner: boolean;
  /** Highlights and scrolls this thread into view when true. */
  highlighted?: boolean;
  /** Read-only (mobile): hide reply / resolve / delete actions. */
  readOnly?: boolean;
  onReply: (parentId: string, body: string) => Promise<void>;
  onResolveToggle: (id: string, resolved: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  /** When the user clicks the thread anywhere, focus the editor mark. */
  onFocusInEditor?: (commentId: string) => void;
}

export function CommentThread({
  workspaceId,
  parent,
  replies,
  currentUserId,
  isOwner,
  highlighted,
  readOnly = false,
  onReply,
  onResolveToggle,
  onDelete,
  onFocusInEditor,
}: Props) {
  const [replyOpen, setReplyOpen] = useState(false);
  const resolved = !!parent.resolvedAt;

  return (
    <article
      data-comment-thread={parent.id}
      className={cn(
        "group rounded-[var(--radius-md)] border bg-background p-3 transition-colors",
        highlighted ? "border-accent-500 ring-2 ring-accent-500/20" : "border-border",
        resolved && "opacity-60",
      )}
      onClick={() => onFocusInEditor?.(parent.id)}
    >
      <CommentRow comment={parent} />

      {replies.length > 0 ? (
        <div className="mt-3 space-y-3 border-l pl-3">
          {replies.map((r) => (
            <CommentRow
              key={r.id}
              comment={r}
              compact
              canDelete={!readOnly && (r.author.id === currentUserId || isOwner)}
              onDelete={() => onDelete(r.id)}
            />
          ))}
        </div>
      ) : null}

      <div className={cn("mt-2 flex items-center gap-1.5", readOnly && "hidden")}>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 px-2 text-fg-3 hover:text-fg-1"
          onClick={(e) => {
            e.stopPropagation();
            setReplyOpen((o) => !o);
          }}
        >
          <MessageSquare className="size-3" />
          Reply
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 px-2 text-fg-3 hover:text-fg-1"
          onClick={async (e) => {
            e.stopPropagation();
            await onResolveToggle(parent.id, !resolved);
          }}
        >
          {resolved ? (
            <>
              <Undo2 className="size-3" />
              Reopen
            </>
          ) : (
            <>
              <Check className="size-3" />
              Resolve
            </>
          )}
        </Button>
        {parent.author.id === currentUserId || isOwner ? (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto gap-1 px-2 text-fg-3 hover:text-destructive"
            onClick={async (e) => {
              e.stopPropagation();
              if (confirm("Delete this thread?")) await onDelete(parent.id);
            }}
            aria-label="Delete thread"
          >
            <Trash2 className="size-3" />
          </Button>
        ) : null}
      </div>

      {replyOpen ? (
        <div className="mt-3" onClick={(e) => e.stopPropagation()}>
          <CommentInput
            workspaceId={workspaceId}
            submitLabel="Reply"
            placeholder="Reply…"
            autoFocus
            onCancel={() => setReplyOpen(false)}
            onSubmit={async (body) => {
              await onReply(parent.id, body);
              setReplyOpen(false);
            }}
          />
        </div>
      ) : null}
    </article>
  );
}

function CommentRow({
  comment,
  compact,
  canDelete,
  onDelete,
}: {
  comment: CommentDto;
  compact?: boolean;
  canDelete?: boolean;
  onDelete?: () => void;
}) {
  const label = comment.author.name ?? comment.author.email.split("@")[0];
  return (
    <div className="flex items-start gap-2">
      <Avatar
        name={label}
        src={comment.author.image}
        size={compact ? "sm" : "md"}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-fg-1">{label}</span>
          <span className="text-[11px] text-fg-3">
            {formatTimestamp(comment.createdAt)}
          </span>
          {comment.resolvedAt ? (
            <span className="rounded-full bg-bg-muted px-1.5 py-0.5 text-[10px] font-medium text-fg-2">
              Resolved
            </span>
          ) : null}
          {canDelete ? (
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto opacity-0 group-hover:opacity-100 hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm("Delete this reply?")) onDelete?.();
              }}
              aria-label="Delete reply"
            >
              <MoreHorizontal className="size-3" />
            </Button>
          ) : null}
        </div>
        <div className="mt-0.5 whitespace-pre-wrap break-words text-[13px] text-fg-1">
          <CommentBody body={comment.body} />
        </div>
      </div>
    </div>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
