import { AgileStatus, EpicStatus, Priority } from "@prisma/client";

/**
 * Single source of truth for agile/epic presentation: ordered enum values,
 * human labels, and accent colors (CSS variables from globals.css). Imported
 * by the epics board (Step 41), the per-PRD properties bar (Step 42), and the
 * API validators. Colors are token references so they track light/dark.
 */

/* ----------------------------- Epic status ----------------------------- */

/** Board column order, left → right. */
export const EPIC_STATUS_ORDER: EpicStatus[] = [
  EpicStatus.PLANNED,
  EpicStatus.IN_PROGRESS,
  EpicStatus.DONE,
];

export const EPIC_STATUS_LABELS: Record<EpicStatus, string> = {
  PLANNED: "Planned",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

export const EPIC_STATUS_COLORS: Record<EpicStatus, string> = {
  PLANNED: "var(--fg-3)",
  IN_PROGRESS: "var(--warning-500)",
  DONE: "var(--success-500)",
};

/* --------------------------- Per-PRD status ---------------------------- */

export const AGILE_STATUS_ORDER: AgileStatus[] = [
  AgileStatus.BACKLOG,
  AgileStatus.TODO,
  AgileStatus.IN_PROGRESS,
  AgileStatus.IN_REVIEW,
  AgileStatus.DONE,
];

export const AGILE_STATUS_LABELS: Record<AgileStatus, string> = {
  BACKLOG: "Backlog",
  TODO: "To do",
  IN_PROGRESS: "In progress",
  IN_REVIEW: "In review",
  DONE: "Done",
};

export const AGILE_STATUS_COLORS: Record<AgileStatus, string> = {
  BACKLOG: "var(--fg-4)",
  TODO: "var(--fg-3)",
  IN_PROGRESS: "var(--warning-500)",
  IN_REVIEW: "var(--info-500)",
  DONE: "var(--success-500)",
};

/* ------------------------------ Priority ------------------------------- */

export const PRIORITY_ORDER: Priority[] = [
  Priority.LOW,
  Priority.MEDIUM,
  Priority.HIGH,
  Priority.URGENT,
];

export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  LOW: "var(--fg-3)",
  MEDIUM: "var(--info-500)",
  HIGH: "var(--warning-500)",
  URGENT: "var(--danger-500)",
};

/* ---------------------------- Epic colors ------------------------------ */

/** Palette offered when creating/recoloring an epic (Step 41). */
export const EPIC_COLOR_PALETTE = [
  "#5333D8", // indigo (brand)
  "#0EA5E9", // sky
  "#10B981", // emerald
  "#F59E0B", // amber
  "#EF4444", // red
  "#EC4899", // pink
  "#8B5CF6", // violet
  "#64748B", // slate
] as const;

export const DEFAULT_EPIC_COLOR = EPIC_COLOR_PALETTE[0];

/* ------------------------------- Types --------------------------------- */

/** String-literal unions for zod validation and props (e.g. `"PLANNED"`). */
export type EpicStatusValue = `${EpicStatus}`;
export type AgileStatusValue = `${AgileStatus}`;
export type PriorityValue = `${Priority}`;

/** The agile metadata carried by a single PRD/page. */
export interface PageAgileMeta {
  epicId: string | null;
  agileStatus: AgileStatus;
  priority: Priority | null;
  storyPoints: number | null;
  targetSprint: string | null;
  assigneeId: string | null;
  externalUrl: string | null;
}

/** An epic plus its board rollups (assigned-PRD counts). Built in Step 41. */
export interface EpicSummary {
  id: string;
  key: string;
  name: string;
  color: string;
  status: EpicStatus;
  position: number;
  /** PRDs assigned to this epic (excluding archived). */
  pageCount: number;
  /** Of those, how many have `agileStatus === DONE`. */
  doneCount: number;
}
