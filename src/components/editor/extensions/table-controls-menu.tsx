"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type Editor } from "@tiptap/react";
import {
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  PanelLeft,
  PanelTop,
  Trash2,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

type TableAction =
  | "addRowBefore"
  | "addRowAfter"
  | "deleteRow"
  | "addColumnBefore"
  | "addColumnAfter"
  | "deleteColumn"
  | "toggleHeaderRow"
  | "toggleHeaderColumn"
  | "deleteTable";

interface MenuItem {
  action: TableAction;
  label: string;
  Icon: LucideIcon;
  danger?: boolean;
}

const ROW_ITEMS: MenuItem[] = [
  { action: "addRowBefore", label: "Insert row above", Icon: ArrowUpToLine },
  { action: "addRowAfter", label: "Insert row below", Icon: ArrowDownToLine },
  { action: "toggleHeaderRow", label: "Toggle header row", Icon: PanelTop },
  { action: "deleteRow", label: "Delete row", Icon: Trash2, danger: true },
  { action: "deleteTable", label: "Delete table", Icon: Trash2, danger: true },
];

const COL_ITEMS: MenuItem[] = [
  { action: "addColumnBefore", label: "Insert column left", Icon: ArrowLeftToLine },
  { action: "addColumnAfter", label: "Insert column right", Icon: ArrowRightToLine },
  { action: "toggleHeaderColumn", label: "Toggle header column", Icon: PanelLeft },
  { action: "deleteColumn", label: "Delete column", Icon: Trash2, danger: true },
  { action: "deleteTable", label: "Delete table", Icon: Trash2, danger: true },
];

interface Props {
  editor: Editor;
  orientation: "row" | "col";
  /** A representative cell in the target row/column; selection is moved here
   * before running the command (prosemirror-tables commands act on the cell
   * around the current selection). */
  cell: HTMLTableCellElement;
  /** Desired top-left anchor in viewport coordinates. */
  x: number;
  y: number;
  onClose: () => void;
}

export function TableControlsMenu({ editor, orientation, cell, x, y, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // Clamp into the viewport once measured (before paint, to avoid a flash).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - pad) {
      left = window.innerWidth - pad - rect.width;
    }
    if (top + rect.height > window.innerHeight - pad) {
      top = window.innerHeight - pad - rect.height;
    }
    setPos({ left: Math.max(pad, left), top: Math.max(pad, top) });
  }, [x, y]);

  // Dismiss on outside click or Escape.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  function exec(action: TableAction) {
    try {
      const at = editor.view.posAtDOM(cell, 0);
      if (typeof at !== "number" || at < 0) {
        onClose();
        return;
      }
      const c = editor.chain().focus().setTextSelection(at);
      switch (action) {
        case "addRowBefore":
          c.addRowBefore();
          break;
        case "addRowAfter":
          c.addRowAfter();
          break;
        case "deleteRow":
          c.deleteRow();
          break;
        case "addColumnBefore":
          c.addColumnBefore();
          break;
        case "addColumnAfter":
          c.addColumnAfter();
          break;
        case "deleteColumn":
          c.deleteColumn();
          break;
        case "toggleHeaderRow":
          c.toggleHeaderRow();
          break;
        case "toggleHeaderColumn":
          c.toggleHeaderColumn();
          break;
        case "deleteTable":
          c.deleteTable();
          break;
      }
      c.run();
    } finally {
      onClose();
    }
  }

  const items = orientation === "row" ? ROW_ITEMS : COL_ITEMS;

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={orientation === "row" ? "Row actions" : "Column actions"}
      className="pm-pop-in fixed z-[var(--z-dropdown)] min-w-[184px] rounded-[var(--radius-md)] border bg-popover p-1 shadow-[var(--shadow-md)]"
      style={{ left: pos.left, top: pos.top }}
    >
      {items.map((item, i) => {
        const firstDanger = item.danger && !items[i - 1]?.danger;
        return (
          <div key={item.action}>
            {firstDanger ? <div className="my-1 h-px bg-border" /> : null}
            <button
              type="button"
              role="menuitem"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec(item.action)}
              className={cn(
                "flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-[13px] transition-colors",
                item.danger
                  ? "text-destructive hover:bg-destructive/10"
                  : "text-fg-2 hover:bg-bg-hover hover:text-fg-1",
              )}
            >
              <item.Icon className="size-4" />
              {item.label}
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
