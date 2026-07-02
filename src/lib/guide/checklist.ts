import "server-only";

import { db } from "@/lib/db";
import type {
  GuideChecklistItem,
  GuideChecklistTarget,
} from "@/lib/guide/types";
import { slugify } from "@/lib/slug";

/**
 * Checklist-target derivation (development_plan.md Step 57).
 *
 * The completeness checklist measures a PRD against a target outline:
 * the headings of the template the page was created from, falling back to
 * the document's own headings, else no target (the card then offers
 * "propose an outline"). Keys are stable across re-derivations so check
 * reports keep lining up as the document evolves.
 */

/** Targets stay bounded so check prompts do too. */
const MAX_TARGET_ITEMS = 20;
/** H1–H3 are outline structure; deeper headings are prose formatting. */
const MAX_HEADING_LEVEL = 3;

type Node = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: Node[];
};

/** Ordered H1–H3 headings of a TipTap JSON doc, blank headings skipped. */
export function extractHeadings(
  doc: unknown,
): { level: number; text: string }[] {
  if (!doc || typeof doc !== "object") return [];
  const out: { level: number; text: string }[] = [];
  walk(doc as Node, out);
  return out;
}

function walk(node: Node, out: { level: number; text: string }[]) {
  if (!node) return;
  if (node.type === "heading") {
    const raw = node.attrs?.level;
    const level = typeof raw === "number" && raw >= 1 ? raw : 1;
    const text = inlineText(node).trim().replace(/\s+/g, " ");
    if (text && level <= MAX_HEADING_LEVEL) out.push({ level, text });
    return; // headings have no nested headings
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) walk(child, out);
  }
}

function inlineText(node: Node): string {
  if (typeof node.text === "string") return node.text;
  if (!Array.isArray(node.content)) return "";
  return node.content.map(inlineText).join("");
}

/** Headings → capped checklist items with stable, de-duplicated keys. */
export function buildChecklistItems(
  headings: { level: number; text: string }[],
): GuideChecklistItem[] {
  const seen = new Map<string, number>();
  return headings.slice(0, MAX_TARGET_ITEMS).map(({ level, text }) => {
    const base = slugify(text) || "section";
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { key: n === 1 ? base : `${base}-${n}`, heading: text, level };
  });
}

/**
 * The page's checklist target: template headings first, the document's own
 * outline as fallback, null when neither yields items. The template branch
 * also falls through when the template row vanished (a deleted template
 * SetNulls `Page.templateId`, but a stale id must not error) or when the
 * template has no headings to measure against.
 */
export async function deriveChecklistTarget(page: {
  templateId: string | null;
  contentJson: unknown;
}): Promise<GuideChecklistTarget | null> {
  if (page.templateId) {
    const template = await db.template.findUnique({
      where: { id: page.templateId },
      select: { name: true, contentJson: true },
    });
    if (template) {
      const items = buildChecklistItems(extractHeadings(template.contentJson));
      if (items.length > 0) {
        return { source: "template", templateName: template.name, items };
      }
    }
  }
  const own = buildChecklistItems(extractHeadings(page.contentJson));
  return own.length > 0 ? { source: "document", items: own } : null;
}
