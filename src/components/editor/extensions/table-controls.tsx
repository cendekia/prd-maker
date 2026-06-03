"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type Editor } from "@tiptap/react";

import { TableControlsMenu } from "./table-controls-menu";

interface RowGeom {
  top: number;
  height: number;
  cell: HTMLTableCellElement;
}
interface ColGeom {
  left: number;
  width: number;
  cell: HTMLTableCellElement;
}
interface Geom {
  tableLeft: number;
  tableTop: number;
  rows: RowGeom[];
  cols: ColGeom[];
}

interface MenuState {
  orientation: "row" | "col";
  cell: HTMLTableCellElement;
  x: number;
  y: number;
}

/** Distance (px) the grips sit outside the table edges. */
const GUTTER = 12;

/**
 * Notion-style hover grips for editor tables. Renders thin handles in the left
 * gutter (one per row) and top gutter (one per column) of whatever table the
 * pointer is over; clicking a handle opens a menu of insert/delete/header
 * actions. The overlay is portaled to <body> and positioned with live
 * viewport rects so it tracks scrolling and column resizes.
 *
 * Mounted only when the editor is editable (see editor.tsx).
 */
export function EditorTableControls({ editor }: { editor: Editor }) {
  const [geom, setGeom] = useState<Geom | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);

  const activeTable = useRef<HTMLTableElement | null>(null);
  const clearTimer = useRef<number | null>(null);
  const rafId = useRef<number | null>(null);
  const menuOpen = useRef(false);

  useEffect(() => {
    menuOpen.current = menu != null;
  }, [menu]);

  const recompute = useCallback(() => {
    const table = activeTable.current;
    if (!table || !document.body.contains(table)) {
      activeTable.current = null;
      setGeom(null);
      return;
    }
    const tableRect = table.getBoundingClientRect();
    const rows: RowGeom[] = [];
    for (const tr of Array.from(table.rows)) {
      const cell = tr.cells[0];
      if (!cell) continue;
      const r = tr.getBoundingClientRect();
      rows.push({ top: r.top, height: r.height, cell });
    }
    const cols: ColGeom[] = [];
    const firstRow = table.rows[0];
    if (firstRow) {
      for (const cell of Array.from(firstRow.cells)) {
        const r = cell.getBoundingClientRect();
        cols.push({ left: r.left, width: r.width, cell });
      }
    }
    setGeom({ tableLeft: tableRect.left, tableTop: tableRect.top, rows, cols });
  }, []);

  const scheduleRecompute = useCallback(() => {
    if (rafId.current != null) return;
    rafId.current = window.requestAnimationFrame(() => {
      rafId.current = null;
      recompute();
    });
  }, [recompute]);

  const cancelClear = useCallback(() => {
    if (clearTimer.current != null) {
      window.clearTimeout(clearTimer.current);
      clearTimer.current = null;
    }
  }, []);

  const scheduleClear = useCallback(() => {
    cancelClear();
    clearTimer.current = window.setTimeout(() => {
      if (menuOpen.current) return;
      activeTable.current = null;
      setGeom(null);
    }, 220);
  }, [cancelClear]);

  // Detect the hovered table from pointer moves over the editor surface.
  useEffect(() => {
    const dom = editor.view.dom as HTMLElement;
    function onPointerMove(e: PointerEvent) {
      const target = e.target as HTMLElement | null;
      const cell = target?.closest("td, th") as HTMLElement | null;
      const table = (cell?.closest("table") as HTMLTableElement | null) ?? null;
      if (table) {
        cancelClear();
        if (table !== activeTable.current) {
          activeTable.current = table;
          scheduleRecompute();
        }
      } else {
        scheduleClear();
      }
    }
    dom.addEventListener("pointermove", onPointerMove);
    return () => dom.removeEventListener("pointermove", onPointerMove);
  }, [editor, cancelClear, scheduleClear, scheduleRecompute]);

  // Keep grips aligned through scrolling, resizing, and table edits.
  useEffect(() => {
    function onChange() {
      if (activeTable.current) scheduleRecompute();
    }
    window.addEventListener("scroll", onChange, true);
    window.addEventListener("resize", onChange);
    editor.on("transaction", onChange);
    return () => {
      window.removeEventListener("scroll", onChange, true);
      window.removeEventListener("resize", onChange);
      editor.off("transaction", onChange);
    };
  }, [editor, scheduleRecompute]);

  // Cleanup any pending timers/frames on unmount.
  useEffect(
    () => () => {
      if (clearTimer.current != null) window.clearTimeout(clearTimer.current);
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
    },
    [],
  );

  function openMenu(
    e: React.MouseEvent,
    orientation: "row" | "col",
    cell: HTMLTableCellElement,
  ) {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = orientation === "row" ? rect.right + 6 : rect.left;
    const y = orientation === "row" ? rect.top : rect.bottom + 6;
    setMenu({ orientation, cell, x, y });
  }

  return (
    <>
      {geom
        ? createPortal(
            <div className="pointer-events-none fixed inset-0 z-[var(--z-dropdown)]">
              {geom.rows.map((r, i) => {
                const h = Math.max(14, Math.min(r.height - 10, 40));
                return (
                  <button
                    key={`row-${i}`}
                    type="button"
                    aria-label={`Row ${i + 1} actions`}
                    title="Row actions"
                    onMouseDown={(e) => e.preventDefault()}
                    onPointerEnter={cancelClear}
                    onPointerLeave={scheduleClear}
                    onClick={(e) => openMenu(e, "row", r.cell)}
                    className="pointer-events-auto absolute rounded-full bg-border transition-colors hover:bg-brand-500"
                    style={{
                      left: geom.tableLeft - GUTTER,
                      top: r.top + (r.height - h) / 2,
                      width: 6,
                      height: h,
                    }}
                  />
                );
              })}
              {geom.cols.map((c, j) => {
                const w = Math.max(16, Math.min(c.width - 10, 64));
                return (
                  <button
                    key={`col-${j}`}
                    type="button"
                    aria-label={`Column ${j + 1} actions`}
                    title="Column actions"
                    onMouseDown={(e) => e.preventDefault()}
                    onPointerEnter={cancelClear}
                    onPointerLeave={scheduleClear}
                    onClick={(e) => openMenu(e, "col", c.cell)}
                    className="pointer-events-auto absolute rounded-full bg-border transition-colors hover:bg-brand-500"
                    style={{
                      top: geom.tableTop - GUTTER,
                      left: c.left + (c.width - w) / 2,
                      width: w,
                      height: 6,
                    }}
                  />
                );
              })}
            </div>,
            document.body,
          )
        : null}

      {menu ? (
        <TableControlsMenu
          editor={editor}
          orientation={menu.orientation}
          cell={menu.cell}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </>
  );
}
