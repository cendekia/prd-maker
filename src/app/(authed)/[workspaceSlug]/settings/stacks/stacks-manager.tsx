"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { StackType } from "@prisma/client";
import { GripVertical, Layers, Pencil, Plus, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_STACK_COLOR,
  STACK_COLOR_PALETTE,
  STACK_TYPE_LABELS,
  STACK_TYPE_ORDER,
  type StackSummary,
} from "@/lib/agent/types";
import { cn } from "@/lib/utils";

import {
  createStackAction,
  deleteStackAction,
  moveStackAction,
  seedDefaultStacksAction,
  updateStackAction,
  type StackFormInput,
} from "./actions";

const inputCls =
  "w-full rounded-[var(--radius-md)] border bg-background px-3 text-[13px] text-fg-1 placeholder:text-fg-4 focus:border-ring focus:outline-none focus-visible:shadow-[var(--shadow-focus)]";

interface Props {
  workspaceSlug: string;
  stacks: StackSummary[];
  canEdit: boolean;
  canDelete: boolean;
}

type DialogState =
  | { mode: "create" }
  | { mode: "edit"; stack: StackSummary }
  | null;

export function StacksManager({
  workspaceSlug,
  stacks,
  canEdit,
  canDelete,
}: Props) {
  const [items, setItems] = useState(stacks);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Server actions revalidate the route; sync local order with fresh props.
  useEffect(() => setItems(stacks), [stacks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((s) => s.id === active.id);
    const newIndex = items.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const previous = items;
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    setError(null);

    const idx = next.findIndex((s) => s.id === active.id);
    const beforeId = idx > 0 ? next[idx - 1].id : null;
    const afterId = idx < next.length - 1 ? next[idx + 1].id : null;
    startTransition(async () => {
      const res = await moveStackAction(
        workspaceSlug,
        String(active.id),
        beforeId,
        afterId,
      );
      if (!res.ok) {
        setItems(previous);
        setError(res.error ?? "Couldn’t reorder the stack.");
      }
    });
  }

  function onDelete(stack: StackSummary) {
    if (!confirm(`Delete “${stack.name}”? This can’t be undone.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteStackAction(workspaceSlug, stack.id);
      if (!res.ok) setError(res.error ?? "Couldn’t delete the stack.");
    });
  }

  function onSeed() {
    setError(null);
    startTransition(async () => {
      const res = await seedDefaultStacksAction(workspaceSlug);
      if (!res.ok) setError(res.error ?? "Couldn’t set up the default stacks.");
    });
  }

  if (items.length === 0) {
    return (
      <div className="rounded-[var(--radius-xl)] border border-dashed px-6 py-10 text-center">
        <Layers className="mx-auto size-8 text-fg-4" />
        <h2 className="t-h3 mt-3">Set up your application stacks</h2>
        <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-[20px] text-fg-3">
          One workspace is one application. Stacks are its deployable surfaces
          — Frontend, Backend, API, WebSocket, Email UI — and every feature in
          the mind map belongs to one.
        </p>
        {error ? (
          <p className="mt-3 text-[12px] text-destructive">{error}</p>
        ) : null}
        {canEdit ? (
          <div className="mt-5 flex items-center justify-center gap-2">
            <Button onClick={onSeed} disabled={pending}>
              {pending ? "Setting up…" : "Set up default stacks"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setDialog({ mode: "create" })}
              disabled={pending}
            >
              <Plus />
              New stack
            </Button>
          </div>
        ) : (
          <p className="mt-4 text-[12px] text-fg-4">
            Ask an editor or owner to set up stacks.
          </p>
        )}
        {dialog ? (
          <StackDialog
            workspaceSlug={workspaceSlug}
            dialog={dialog}
            onClose={() => setDialog(null)}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <p className="text-[13px] text-fg-3">
          The deployable surfaces of this workspace’s application. Every
          feature in the mind map belongs to one stack.
          {canEdit ? " Drag to reorder." : ""}
        </p>
        {canEdit ? (
          <Button size="sm" onClick={() => setDialog({ mode: "create" })}>
            <Plus />
            New stack
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-3 text-[12px] text-destructive">{error}</p>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={items.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="mt-4 space-y-2">
            {items.map((stack) => (
              <StackRow
                key={stack.id}
                stack={stack}
                canEdit={canEdit}
                canDelete={canDelete}
                onEdit={() => setDialog({ mode: "edit", stack })}
                onDelete={() => onDelete(stack)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {dialog ? (
        <StackDialog
          workspaceSlug={workspaceSlug}
          dialog={dialog}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------- Row ----------------------------------- */

function StackRow({
  stack,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  stack: StackSummary;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stack.id, disabled: !canEdit });

  const deleteBlocked = stack.featureCount > 0;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2.5 rounded-[var(--radius-md)] border bg-background px-3 py-2.5",
        isDragging && "relative z-10 opacity-90 shadow-[var(--shadow-md)]",
      )}
    >
      {canEdit ? (
        <button
          type="button"
          aria-label={`Reorder ${stack.name}`}
          className="cursor-grab touch-none text-fg-4 hover:text-fg-2 active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      ) : null}

      <span
        aria-hidden
        className="size-3 shrink-0 rounded-[var(--radius-full)]"
        style={{ backgroundColor: stack.color }}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-fg-1">
            {stack.name}
          </span>
          <Badge variant="outline">{STACK_TYPE_LABELS[stack.type]}</Badge>
        </div>
        {stack.description ? (
          <p className="mt-0.5 truncate text-[12px] text-fg-3">
            {stack.description}
          </p>
        ) : null}
      </div>

      <span className="shrink-0 text-[12px] text-fg-3">
        {stack.featureCount === 1
          ? "1 feature"
          : `${stack.featureCount} features`}
      </span>

      {canEdit ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Edit ${stack.name}`}
          onClick={onEdit}
        >
          <Pencil />
        </Button>
      ) : null}
      {canDelete ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${stack.name}`}
          title={
            deleteBlocked
              ? "Reassign or delete its features first"
              : "Delete stack"
          }
          disabled={deleteBlocked}
          onClick={onDelete}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 />
        </Button>
      ) : null}
    </li>
  );
}

/* ------------------------------ Dialog --------------------------------- */

function StackDialog({
  workspaceSlug,
  dialog,
  onClose,
}: {
  workspaceSlug: string;
  dialog: NonNullable<DialogState>;
  onClose: () => void;
}) {
  const initial = dialog.mode === "edit" ? dialog.stack : null;
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<StackType>(
    initial?.type ?? StackType.FRONTEND,
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [color, setColor] = useState(initial?.color ?? DEFAULT_STACK_COLOR);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    setSaving(true);
    setError(null);
    const input: StackFormInput = { name, type, description, color };
    const res =
      dialog.mode === "create"
        ? await createStackAction(workspaceSlug, input)
        : await updateStackAction(workspaceSlug, dialog.stack.id, input);
    if (!res.ok) {
      setError(res.error ?? "Couldn’t save the stack.");
      setSaving(false);
      return;
    }
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4">
      <div
        className="pm-fade-in absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={dialog.mode === "create" ? "New stack" : "Edit stack"}
        className="pm-pop-in relative w-full max-w-md rounded-[var(--radius-xl)] border bg-background p-5 shadow-[var(--shadow-xl)]"
      >
        <div className="flex items-center justify-between">
          <h2 className="t-h3">
            {dialog.mode === "create" ? "New stack" : "Edit stack"}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-[var(--radius-sm)] text-fg-3 hover:bg-bg-hover hover:text-fg-1"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <Field label="Name">
            <input
              autoFocus
              aria-label="Stack name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Backend"
              maxLength={60}
              className={cn(inputCls, "h-9")}
            />
          </Field>

          <Field label="Type">
            <div className="flex flex-wrap gap-1.5">
              {STACK_TYPE_ORDER.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={type === t}
                  onClick={() => setType(t)}
                  className={cn(
                    "rounded-[var(--radius-sm)] border px-2 py-1 text-[12px] font-medium transition-colors",
                    type === t
                      ? "border-fg-1 bg-bg-muted text-fg-1"
                      : "border-input text-fg-3 hover:text-fg-1",
                  )}
                >
                  {STACK_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Description">
            <textarea
              aria-label="Stack description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional one-liner about this surface"
              rows={2}
              className={cn(inputCls, "resize-none py-2 leading-[20px]")}
            />
          </Field>

          <Field label="Color">
            <div className="flex flex-wrap gap-2">
              {STACK_COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  aria-pressed={color === c}
                  onClick={() => setColor(c)}
                  style={{ backgroundColor: c }}
                  className={cn(
                    "size-6 rounded-[var(--radius-full)] ring-offset-2 ring-offset-background transition-shadow",
                    color === c && "ring-2 ring-fg-1",
                  )}
                />
              ))}
            </div>
          </Field>
        </div>

        {error ? (
          <p className="mt-3 text-[12px] text-destructive">{error}</p>
        ) : null}

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !name.trim()}>
            {saving ? "Saving…" : dialog.mode === "create" ? "Create" : "Save"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  // A div (not <label>) since some fields contain button groups, which a
  // wrapping <label> would mis-associate with.
  return (
    <div>
      <span className="t-label mb-1.5 block">{label}</span>
      {children}
    </div>
  );
}
