"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ChevronRight, FileText } from "lucide-react";

import type { PageTreeNode } from "@/lib/types";
import { usePageTree } from "@/hooks/use-page-tree";
import { cn } from "@/lib/utils";

import { PageTreeNode as TreeNode, type FlatTreeRow } from "./page-tree-node";

interface Props {
  workspaceId: string;
  workspaceSlug: string;
  initialTree: PageTreeNode[];
  filter: string;
}

export function PageTree({ workspaceId, workspaceSlug, initialTree, filter }: Props) {
  const router = useRouter();
  const params = useParams<{ pageId?: string | string[] }>();
  const activePageId = Array.isArray(params?.pageId)
    ? params.pageId[0]
    : params?.pageId;

  const { tree, createPage, renamePage, archivePage, movePage } = usePageTree(
    workspaceId,
    initialTree,
  );

  // dnd-kit auto-generates aria-describedby IDs from a module-level counter,
  // which mismatches between server and client. Render a static SSR-safe
  // version on first paint, then swap to the draggable tree after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  function toggleExpand(id: string) {
    setExpanded((e) => ({ ...e, [id]: !e[id] }));
  }

  // Build the flat list of visible rows, respecting the filter.
  const flat = useMemo(
    () => flattenTree(tree, expanded, filter.trim().toLowerCase()),
    [tree, expanded, filter],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const draggedId = String(active.id);
    const overId = String(over.id);
    const overRow = flat.find((r) => r.id === overId);
    if (!overRow) return;

    // Drop onto a row → become a child of that row.
    try {
      await movePage(draggedId, { newParentId: overRow.id });
      // Auto-expand the new parent so the moved node is visible.
      setExpanded((e) => ({ ...e, [overRow.id]: true }));
    } catch (err) {
      console.error(err);
      alert((err as Error).message);
    }
  }

  async function handleCreateChild(parentId: string) {
    try {
      const created = await createPage({ parentId, title: "Untitled" });
      setExpanded((e) => ({ ...e, [parentId]: true }));
      router.push(`/${workspaceSlug}/p/${created.id}`);
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function handleRename(id: string, title: string) {
    try {
      await renamePage(id, title);
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function handleArchive(id: string) {
    try {
      await archivePage(id);
      if (activePageId === id) router.push(`/${workspaceSlug}`);
    } catch (err) {
      alert((err as Error).message);
    }
  }

  if (flat.length === 0) {
    return (
      <p className="px-2 py-3 text-[12px] text-fg-3">
        {filter
          ? "No pages match your search."
          : "No pages yet — start with a template or a blank page."}
      </p>
    );
  }

  if (!mounted) {
    return (
      <div className="flex flex-col gap-px">
        {flat.map((row) => (
          <StaticTreeRow
            key={row.id}
            workspaceSlug={workspaceSlug}
            row={row}
            isActive={activePageId === row.id}
          />
        ))}
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <SortableContext
        items={flat.map((r) => r.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-px">
          {flat.map((row) => (
            <TreeNode
              key={row.id}
              workspaceSlug={workspaceSlug}
              row={row}
              isActive={activePageId === row.id}
              onToggleExpand={toggleExpand}
              onCreateChild={handleCreateChild}
              onRename={handleRename}
              onArchive={handleArchive}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

/**
 * Non-interactive row for SSR. Same visual as PageTreeNode but without
 * `useSortable` (which generates SSR-mismatched aria IDs). Replaced by the
 * full draggable version after the client mounts.
 */
function StaticTreeRow({
  workspaceSlug,
  row,
  isActive,
}: {
  workspaceSlug: string;
  row: FlatTreeRow;
  isActive: boolean;
}) {
  return (
    <div
      style={{ paddingLeft: 8 + row.depth * 14 }}
      className={cn(
        "flex h-7 items-center gap-1 rounded-[var(--radius-sm)] pr-1 text-[13px]",
        isActive ? "bg-bg-active text-fg-1" : "text-fg-2",
      )}
    >
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center text-fg-4",
          row.isExpanded && "rotate-90",
          !row.hasChildren && "invisible",
        )}
      >
        <ChevronRight className="size-3" />
      </span>
      <span className="flex size-4 shrink-0 items-center justify-center text-fg-3">
        <FileText className="size-3.5" />
      </span>
      <Link
        href={`/${workspaceSlug}/p/${row.id}`}
        className="min-w-0 flex-1 truncate"
      >
        {row.title || "Untitled"}
      </Link>
    </div>
  );
}

function flattenTree(
  nodes: PageTreeNode[],
  expanded: Record<string, boolean>,
  filter: string,
): FlatTreeRow[] {
  const out: FlatTreeRow[] = [];

  function pushRow(node: PageTreeNode, depth: number, isExpanded: boolean) {
    out.push({
      id: node.id,
      parentId: node.parentId,
      title: node.title,
      depth,
      hasChildren: node.children.length > 0,
      isExpanded,
    });
  }

  if (filter) {
    // Auto-expand any subtree containing a match.
    function walkFiltered(node: PageTreeNode, depth: number) {
      if (!subtreeHasMatch(node, filter)) return;
      pushRow(node, depth, true);
      for (const child of node.children) walkFiltered(child, depth + 1);
    }
    for (const n of nodes) walkFiltered(n, 0);
    return out;
  }

  function walk(node: PageTreeNode, depth: number) {
    const isExpanded = !!expanded[node.id];
    pushRow(node, depth, isExpanded);
    if (isExpanded) {
      for (const child of node.children) walk(child, depth + 1);
    }
  }
  for (const n of nodes) walk(n, 0);
  return out;
}

function subtreeHasMatch(node: PageTreeNode, filter: string): boolean {
  if (node.title.toLowerCase().includes(filter)) return true;
  return node.children.some((c) => subtreeHasMatch(c, filter));
}
