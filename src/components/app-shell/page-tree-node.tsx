"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  FilePlus,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface FlatTreeRow {
  id: string;
  parentId: string | null;
  title: string;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
}

interface Props {
  workspaceSlug: string;
  row: FlatTreeRow;
  isActive: boolean;
  onToggleExpand: (id: string) => void;
  onCreateChild: (parentId: string) => void;
  onRename: (id: string, title: string) => void;
  onArchive: (id: string) => void;
}

export function PageTreeNode({
  workspaceSlug,
  row,
  isActive,
  onToggleExpand,
  onCreateChild,
  onRename,
  onArchive,
}: Props) {
  const sortable = useSortable({ id: row.id, data: { type: "tree-node", row } });
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
    over,
  } = sortable;

  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(row.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointer(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [menuOpen]);

  // Drop indicator: when this row is hovered as a drop target, render an
  // inset accent ring so users see where the drop will land.
  const isDropTarget = isOver && over?.id === row.id && !isDragging;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        paddingLeft: 8 + row.depth * 14,
      }}
      className={cn(
        "group relative flex h-7 items-center gap-1 rounded-[var(--radius-sm)] pr-1 text-[13px] transition-colors",
        isActive ? "bg-bg-active text-fg-1" : "text-fg-2 hover:bg-bg-hover hover:text-fg-1",
        isDragging && "opacity-50",
        isDropTarget && "ring-2 ring-brand-500 ring-inset",
      )}
    >
      {/* Expand caret — shown only if there are children */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          if (row.hasChildren) onToggleExpand(row.id);
        }}
        aria-label={row.isExpanded ? "Collapse" : "Expand"}
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded text-fg-4 transition-transform",
          row.isExpanded && "rotate-90",
          !row.hasChildren && "invisible",
        )}
      >
        <ChevronRight className="size-3" />
      </button>

      {/* Drag-grip area uses the file icon as a drag handle */}
      <span
        {...attributes}
        {...listeners}
        className="flex size-4 shrink-0 cursor-grab items-center justify-center text-fg-3 active:cursor-grabbing"
      >
        <FileText className="size-3.5" />
      </span>

      {/* Title — link to the page, double-click to rename */}
      {renaming ? (
        <input
          autoFocus
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onBlur={() => {
            const t = draftTitle.trim();
            setRenaming(false);
            if (t && t !== row.title) onRename(row.id, t);
            else setDraftTitle(row.title);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              setDraftTitle(row.title);
              setRenaming(false);
            }
          }}
          className="min-w-0 flex-1 rounded-[var(--radius-xs)] border border-ring bg-background px-1 text-[13px] text-fg-1 outline-none"
        />
      ) : (
        <Link
          href={`/${workspaceSlug}/p/${row.id}`}
          className="min-w-0 flex-1 truncate"
          onDoubleClick={(e) => {
            e.preventDefault();
            setRenaming(true);
          }}
        >
          {row.title || "Untitled"}
        </Link>
      )}

      {/* Hover affordances */}
      <div className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
        <button
          type="button"
          aria-label="Add child page"
          className="flex size-5 items-center justify-center rounded text-fg-3 hover:bg-bg-active hover:text-fg-1"
          onClick={(e) => {
            e.preventDefault();
            onCreateChild(row.id);
          }}
        >
          <Plus className="size-3.5" />
        </button>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-label="Page menu"
            className="flex size-5 items-center justify-center rounded text-fg-3 hover:bg-bg-active hover:text-fg-1"
            onClick={(e) => {
              e.preventDefault();
              setMenuOpen((o) => !o);
            }}
          >
            <MoreHorizontal className="size-3.5" />
          </button>
          {menuOpen ? (
            <div
              className="absolute right-0 top-full z-[var(--z-dropdown)] mt-1 w-44 rounded-[var(--radius-md)] border bg-popover p-1 shadow-[var(--shadow-lg)]"
              role="menu"
            >
              <MenuItem
                icon={<Pencil className="size-3.5" />}
                onClick={() => {
                  setMenuOpen(false);
                  setRenaming(true);
                }}
              >
                Rename
              </MenuItem>
              <MenuItem
                icon={<FilePlus className="size-3.5" />}
                onClick={() => {
                  setMenuOpen(false);
                  onCreateChild(row.id);
                }}
              >
                Add child page
              </MenuItem>
              <div className="my-1 h-px bg-border" />
              <MenuItem
                danger
                icon={<Trash2 className="size-3.5" />}
                onClick={() => {
                  setMenuOpen(false);
                  if (confirm("Archive this page?")) onArchive(row.id);
                }}
              >
                Archive
              </MenuItem>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MenuItem({
  children,
  icon,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn(
        "h-7 w-full justify-start gap-2 rounded-[var(--radius-sm)] text-[12px] font-normal",
        danger && "text-destructive hover:text-destructive",
      )}
      role="menuitem"
    >
      {icon}
      {children}
    </Button>
  );
}
