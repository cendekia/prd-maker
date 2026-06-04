"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { EpicStatus } from "@prisma/client";
import { GripVertical, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  EPIC_STATUS_COLORS,
  EPIC_STATUS_LABELS,
  EPIC_STATUS_ORDER,
  type EpicCore,
  type EpicSummary,
} from "@/lib/agile";
import { cn } from "@/lib/utils";

import { EpicCard } from "./epic-card";
import { EpicDetail } from "./epic-detail";
import { EpicDialog, type EpicDialogInitial } from "./epic-dialog";

type Columns = Record<EpicStatus, EpicSummary[]>;

const bodyCls =
  "flex min-h-[140px] flex-1 flex-col gap-2 overflow-y-auto rounded-[var(--radius-lg)] bg-bg-subtle p-2";

function group(epics: EpicSummary[]): Columns {
  const cols: Columns = { PLANNED: [], IN_PROGRESS: [], DONE: [] };
  for (const e of epics) cols[e.status].push(e);
  return cols;
}

function findStatus(cols: Columns, id: string): EpicStatus | undefined {
  for (const s of EPIC_STATUS_ORDER) {
    if (cols[s].some((e) => e.id === id)) return s;
  }
  return undefined;
}

function removeFrom(cols: Columns, id: string): Columns {
  const next = { ...cols };
  for (const s of EPIC_STATUS_ORDER) next[s] = cols[s].filter((e) => e.id !== id);
  return next;
}

function applyUpdate(cols: Columns, core: EpicCore): Columns {
  let found: EpicSummary | undefined;
  let cur: EpicStatus | undefined;
  for (const s of EPIC_STATUS_ORDER) {
    const f = cols[s].find((e) => e.id === core.id);
    if (f) {
      found = f;
      cur = s;
      break;
    }
  }
  if (!found || !cur) return cols;
  const merged: EpicSummary = { ...found, ...core };
  const next = { ...cols };
  if (cur !== core.status) {
    next[cur] = cols[cur].filter((e) => e.id !== core.id);
    next[core.status] = [...cols[core.status], merged];
  } else {
    next[cur] = cols[cur].map((e) => (e.id === core.id ? merged : e));
  }
  return next;
}

type DialogState =
  | { mode: "create"; defaultStatus?: EpicStatus }
  | { mode: "edit"; initial: EpicDialogInitial }
  | null;

interface Props {
  workspaceId: string;
  workspaceSlug: string;
  initialEpics: EpicSummary[];
  canEdit: boolean;
}

export function EpicsBoard({
  workspaceId,
  workspaceSlug,
  initialEpics,
  canEdit,
}: Props) {
  const [columns, setColumns] = useState<Columns>(() => group(initialEpics));
  const [dialog, setDialog] = useState<DialogState>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  // dnd-kit generates SSR-mismatched aria ids; render a static board first,
  // then enable drag after mount (same approach as the page tree).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const interactive = mounted && canEdit;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function openEdit(epic: EpicSummary) {
    setDialog({
      mode: "edit",
      initial: {
        id: epic.id,
        name: epic.name,
        description: epic.description,
        color: epic.color,
        status: epic.status,
      },
    });
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const fromStatus = findStatus(columns, activeId);
    if (!fromStatus) return;

    const isColumn = (EPIC_STATUS_ORDER as string[]).includes(overId);
    const toStatus = isColumn
      ? (overId as EpicStatus)
      : (findStatus(columns, overId) ?? fromStatus);
    if (activeId === overId) return;

    const card = columns[fromStatus].find((x) => x.id === activeId);
    if (!card) return;

    // Build the target column without the dragged card, then insert it.
    // Default to the end of the column — used when dropping on the column body
    // or below the last card (fixes "drop at the bottom lands in the middle").
    const targetWithout = columns[toStatus].filter((x) => x.id !== activeId);
    let insertIndex = targetWithout.length;
    if (!isColumn) {
      const overIdx = targetWithout.findIndex((x) => x.id === overId);
      if (overIdx >= 0) {
        // Insert AFTER the hovered card when the dragged card's center is past
        // the hovered card's center, otherwise before it — respects direction
        // so a downward drop past the last card lands at the bottom.
        const activeRect = active.rect.current.translated;
        const overRect = over.rect;
        const after =
          !!activeRect &&
          activeRect.top + activeRect.height / 2 >
            overRect.top + overRect.height / 2;
        insertIndex = after ? overIdx + 1 : overIdx;
      }
    }
    if (fromStatus === toStatus) {
      // Re-inserting active at its original index (in the array sans active)
      // reproduces the original order — nothing changed.
      const origIdx = columns[toStatus].findIndex((x) => x.id === activeId);
      if (insertIndex === origIdx) return;
    }
    targetWithout.splice(insertIndex, 0, { ...card, status: toStatus });
    const beforeId = targetWithout[insertIndex - 1]?.id ?? null;
    const afterId = targetWithout[insertIndex + 1]?.id ?? null;

    const snapshot = columns;
    const next: Columns = { ...columns };
    next[toStatus] = targetWithout;
    if (fromStatus !== toStatus) {
      next[fromStatus] = columns[fromStatus].filter((x) => x.id !== activeId);
    }
    setColumns(next);

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/epics/${activeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: toStatus, beforeId, afterId }),
      });
      if (!res.ok) {
        throw new Error(
          (await res.json().catch(() => ({}))).error ?? "Couldn’t move the epic.",
        );
      }
    } catch (err) {
      setColumns(snapshot);
      alert((err as Error).message);
    }
  }

  const handlers = {
    onOpen: (id: string) => setDetailId(id),
    onEdit: openEdit,
  };

  const activeEpic = activeId
    ? (Object.values(columns)
        .flat()
        .find((e) => e.id === activeId) ?? null)
    : null;

  const board = (
    <div className="flex flex-1 gap-4 overflow-x-auto px-6 py-4">
      {EPIC_STATUS_ORDER.map((status) => {
        const cards = columns[status];
        const cardEls = cards.map((epic) =>
          interactive ? (
            <SortableEpicCard
              key={epic.id}
              epic={epic}
              onOpen={() => handlers.onOpen(epic.id)}
              onEdit={() => handlers.onEdit(epic)}
            />
          ) : (
            <EpicCard
              key={epic.id}
              epic={epic}
              canEdit={canEdit}
              onOpen={() => handlers.onOpen(epic.id)}
              onEdit={() => handlers.onEdit(epic)}
            />
          ),
        );
        const empty =
          cards.length === 0 ? (
            <p className="px-2 py-6 text-center text-[12px] text-fg-4">No epics</p>
          ) : null;

        return (
          <ColumnShell
            key={status}
            status={status}
            count={cards.length}
            canEdit={canEdit}
            onAdd={() => setDialog({ mode: "create", defaultStatus: status })}
          >
            {interactive ? (
              <DroppableBody status={status} itemIds={cards.map((c) => c.id)}>
                {cardEls}
                {empty}
              </DroppableBody>
            ) : (
              <div className={bodyCls}>
                {cardEls}
                {empty}
              </div>
            )}
          </ColumnShell>
        );
      })}
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b px-6 py-3">
        <div>
          <h1 className="text-[15px] font-semibold text-fg-1">Epics</h1>
          <p className="text-[12px] text-fg-3">
            Group PRDs into epics and track delivery on the board.
          </p>
        </div>
        {canEdit ? (
          <Button size="sm" onClick={() => setDialog({ mode: "create" })}>
            <Plus />
            New epic
          </Button>
        ) : null}
      </div>

      {interactive ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          {board}
          {/* The dragged card is rendered once in an isolated overlay layer so
              it follows the cursor via a GPU-composited transform — the source
              card stays put (dimmed) instead of repainting its shadow every
              frame, which is what made dragging feel laggy. */}
          <DragOverlay dropAnimation={null}>
            {activeEpic ? (
              <div className="cursor-grabbing rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)]">
                <EpicCard
                  epic={activeEpic}
                  canEdit={false}
                  onOpen={() => {}}
                  onEdit={() => {}}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        board
      )}

      {dialog ? (
        <EpicDialog
          workspaceId={workspaceId}
          mode={dialog.mode}
          initial={dialog.mode === "edit" ? dialog.initial : undefined}
          defaultStatus={dialog.mode === "create" ? dialog.defaultStatus : undefined}
          onClose={() => setDialog(null)}
          onCreated={(epic) =>
            setColumns((c) => ({ ...c, [epic.status]: [...c[epic.status], epic] }))
          }
          onUpdated={(core) => setColumns((c) => applyUpdate(c, core))}
          onArchived={(id) => {
            setColumns((c) => removeFrom(c, id));
            setDetailId((d) => (d === id ? null : d));
          }}
        />
      ) : null}

      {detailId ? (
        <EpicDetail
          workspaceId={workspaceId}
          workspaceSlug={workspaceSlug}
          epicId={detailId}
          canEdit={canEdit}
          onClose={() => setDetailId(null)}
          onEdit={(initial) => {
            setDetailId(null);
            setDialog({ mode: "edit", initial });
          }}
        />
      ) : null}
    </div>
  );
}

function ColumnShell({
  status,
  count,
  canEdit,
  onAdd,
  children,
}: {
  status: EpicStatus;
  count: number;
  canEdit: boolean;
  onAdd: () => void;
  children: ReactNode;
}) {
  return (
    <section className="flex w-[300px] shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span
          className="size-2 rounded-[var(--radius-full)]"
          style={{ backgroundColor: EPIC_STATUS_COLORS[status] }}
        />
        <h2 className="text-[13px] font-semibold text-fg-1">
          {EPIC_STATUS_LABELS[status]}
        </h2>
        <span className="text-[12px] text-fg-3">{count}</span>
        {canEdit ? (
          <button
            type="button"
            aria-label={`New epic in ${EPIC_STATUS_LABELS[status]}`}
            onClick={onAdd}
            className="ml-auto flex size-6 items-center justify-center rounded-[var(--radius-sm)] text-fg-3 hover:bg-bg-hover hover:text-fg-1"
          >
            <Plus className="size-3.5" />
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function DroppableBody({
  status,
  itemIds,
  children,
}: {
  status: EpicStatus;
  itemIds: string[];
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={cn(bodyCls, isOver && "ring-2 ring-inset ring-brand-500")}
    >
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </div>
  );
}

function SortableEpicCard({
  epic,
  onOpen,
  onEdit,
}: {
  epic: EpicSummary;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: epic.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : undefined,
      }}
    >
      <EpicCard
        epic={epic}
        canEdit
        onOpen={onOpen}
        onEdit={onEdit}
        grip={
          <button
            ref={setActivatorNodeRef}
            type="button"
            aria-label="Drag epic"
            className="flex size-6 cursor-grab items-center justify-center rounded-[var(--radius-sm)] text-fg-4 hover:bg-bg-hover hover:text-fg-2 active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-3.5" />
          </button>
        }
      />
    </div>
  );
}
