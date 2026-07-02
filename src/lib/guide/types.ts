import { GuideCheckStatus } from "@prisma/client";

/**
 * Single source of truth for the PRD completeness checklist's presentation
 * and transport types (development_plan.md Step 57): the checklist-target
 * shape derived from a template or the document's own outline, the
 * `GuideCheckReport` JSON contract persisted on `GuideCheck.report`, label /
 * color maps (CSS-variable tokens so they track light/dark), and the shapes
 * the /api/guide/check route serves. Mirrors src/lib/agent/types.ts style.
 *
 * Client-safe: imports only Prisma enums (plain objects in the bundle).
 */

/* ------------------------------- Target -------------------------------- */

/** One target item the document is measured against. */
export interface GuideChecklistItem {
  /** Stable key — slugified heading, `-2`-style suffix for duplicates. */
  key: string;
  heading: string;
  /** Heading level in the source outline (1–3). */
  level: number;
}

/** Where the checklist target came from. */
export type GuideTargetSource = "template" | "document";

export const GUIDE_TARGET_SOURCE_LABELS: Record<GuideTargetSource, string> = {
  template: "From the page's template",
  document: "From the document's outline",
};

export interface GuideChecklistTarget {
  source: GuideTargetSource;
  /** Set when `source` is "template". */
  templateName?: string;
  items: GuideChecklistItem[];
}

/* ------------------------------- Report -------------------------------- */

/** Report-internal status per item — not a DB enum (like ImpactSeverity). */
export type GuideItemStatus = "covered" | "partial" | "missing";

export const GUIDE_ITEM_STATUS_ORDER: GuideItemStatus[] = [
  "covered",
  "partial",
  "missing",
];

export const GUIDE_ITEM_STATUS_LABELS: Record<GuideItemStatus, string> = {
  covered: "Covered",
  partial: "Partial",
  missing: "Missing",
};

export const GUIDE_ITEM_STATUS_COLORS: Record<GuideItemStatus, string> = {
  covered: "var(--success-500)",
  partial: "var(--warning-500)",
  missing: "var(--fg-4)",
};

/** One evaluated checklist item. */
export interface GuideCheckReportItem {
  key: string;
  heading: string;
  status: GuideItemStatus;
  /** One-line assessment shown under the heading. */
  note: string;
  /** Chat message a nudge chip sends to draft the gap (Step 59). */
  nudge: string;
}

/** JSON contract persisted on `GuideCheck.report` — overwritten only on
 * READY, so a FAILED run keeps the last good report. */
export interface GuideCheckReport {
  items: GuideCheckReportItem[];
  /** One/two-sentence overall read of the document. */
  summary: string;
}

/* ------------------------------ Transport ------------------------------ */

/** The latest check as served by /api/guide/check (Step 58). */
export interface GuideCheckSnapshot {
  status: GuideCheckStatus;
  report: GuideCheckReport | null;
  model: string | null;
  error: string | null;
  updatedAt: string;
}

export interface GuideCheckPayload {
  /** Null when the page has no template and no headings yet. */
  target: GuideChecklistTarget | null;
  /** Null when the page has never been checked. */
  check: GuideCheckSnapshot | null;
}
