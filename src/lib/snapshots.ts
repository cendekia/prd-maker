import "server-only";

import { Prisma, VersionKind, type PageVersion } from "@prisma/client";

import { enqueueExtractPage } from "@/lib/agent/jobs";
import { db } from "@/lib/db";
import { extractText } from "@/lib/editor-text";

export type SnapshotKind = `${VersionKind}`; // "AUTO" | "MANUAL" | "PRE_AI"

interface TakeSnapshotArgs {
  pageId: string;
  userId: string;
  kind: SnapshotKind;
  /**
   * Authoritative editor JSON. When the call originates from a client editor
   * (auto-save trigger, manual button, pre-AI write), this is the live doc
   * the user is editing. Cron jobs and headless calls omit it; the helper
   * then falls back to whatever Page.contentJson the legacy save path wrote.
   *
   * When provided, we also update Page.contentJson + contentText so search
   * (Step 22) and other consumers see the freshest projection.
   */
  contentJson?: unknown;
}

export interface TakeSnapshotResult {
  version: PageVersion;
  /** True when the call inserted a new row, false when deduped against the previous AUTO snapshot. */
  created: boolean;
  /**
   * True when an empty incoming doc was prevented from clobbering non-empty
   * stored content (see the clobber guard below). The page's content is left
   * untouched; for MANUAL/PRE_AI the version still captures the real stored
   * content so it remains a valid restore point.
   */
  guarded: boolean;
}

const KIND_VALUES: Record<SnapshotKind, VersionKind> = {
  AUTO: VersionKind.AUTO,
  MANUAL: VersionKind.MANUAL,
  PRE_AI: VersionKind.PRE_AI,
};

const EMPTY_DOC = {
  type: "doc",
  content: [{ type: "paragraph" }],
} as const;

/**
 * Snapshot the current page state into a `PageVersion` row.
 *
 * Dedupe rule: if `kind` is `AUTO` and the most recent version on the page
 * has identical `snapshotJson`, we skip the insert and return the existing
 * row. This keeps the cron job and the client poller from filling history
 * with no-op rows when nobody is actively editing. `MANUAL` and `PRE_AI`
 * never dedupe — those are explicit guarantees the caller relies on.
 */
export async function takeSnapshot({
  pageId,
  userId,
  kind,
  contentJson,
}: TakeSnapshotArgs): Promise<TakeSnapshotResult> {
  const versionKind = KIND_VALUES[kind];
  if (!versionKind) {
    throw new Error(`Unknown snapshot kind: ${kind}`);
  }

  const page = await db.page.findUnique({
    where: { id: pageId },
    select: {
      id: true,
      workspaceId: true,
      contentJson: true,
      yDocState: true,
      archivedAt: true,
    },
  });
  if (!page) throw new Error(`Page ${pageId} not found`);
  if (page.archivedAt) throw new Error(`Page ${pageId} is archived`);

  const incomingProvided = contentJson !== undefined && contentJson !== null;

  // Clobber guard: a blank incoming doc must never overwrite non-empty stored
  // content. This defends against the editor briefly rendering empty when
  // collaboration can't connect — y-prosemirror resets the ProseMirror doc to
  // the (empty) Yjs state, ignoring the loaded contentJson — whose auto-save
  // would otherwise wipe Page.contentJson + contentText. When it trips we keep
  // the page untouched and snapshot the *stored* content, so MANUAL/PRE_AI
  // still produce a valid restore point instead of an empty one.
  const guarded =
    incomingProvided &&
    isEmptyDoc(contentJson) &&
    docHasContent(page.contentJson);

  // Resolve the JSON to snapshot. Caller-provided JSON wins because it
  // reflects the live editor state; when guarded we fall back to the stored
  // content, and headless callers (cron) fall back to it too.
  const json: Prisma.InputJsonValue = guarded
    ? (page.contentJson as Prisma.InputJsonValue)
    : incomingProvided
      ? (contentJson as Prisma.InputJsonValue)
      : ((page.contentJson as Prisma.InputJsonValue | null) ??
        (EMPTY_DOC as Prisma.InputJsonValue));

  // Dedupe AUTO snapshots only.
  if (versionKind === VersionKind.AUTO) {
    const last = await db.pageVersion.findFirst({
      where: { pageId, kind: VersionKind.AUTO },
      orderBy: { createdAt: "desc" },
      select: { id: true, snapshotJson: true, kind: true, pageId: true, yDocState: true, createdById: true, createdAt: true },
    });
    if (last && jsonEqual(last.snapshotJson, json)) {
      return { version: last as PageVersion, created: false, guarded };
    }
  }

  const version = await db.pageVersion.create({
    data: {
      pageId,
      kind: versionKind,
      createdById: userId,
      snapshotJson: json,
      yDocState: page.yDocState ?? undefined,
    },
  });

  // If the caller supplied fresh JSON, update Page.contentJson + contentText
  // so search and other consumers see it. Skipped when no JSON was supplied
  // (cron — don't overwrite from stale state) or when guarded (don't wipe).
  if (incomingProvided && !guarded) {
    await db.page.update({
      where: { id: pageId },
      data: {
        contentJson: json,
        contentText: extractText(contentJson),
      },
    });
  }

  // MANUAL/PRE_AI snapshots mark meaningful edits — queue a re-extraction so
  // the agent's feature map keeps up (Step 49). Skip when guarded: the page
  // content didn't change. Never let this fail the snapshot itself — the
  // snapshot-before-AI guarantee is the hard invariant.
  if (versionKind !== VersionKind.AUTO && !guarded) {
    try {
      await enqueueExtractPage({
        workspaceId: page.workspaceId,
        pageId,
        requestedById: userId,
      });
    } catch {
      /* extraction is best-effort */
    }
  }

  return { version, created: true, guarded };
}

/**
 * Content-bearing nodes that count as "not empty" even without text — atoms
 * and structural blocks the editor can hold that carry meaning on their own.
 */
const CONTENTFUL_NODE_TYPES = new Set([
  "image",
  "embed",
  "horizontalRule",
  "codeBlock",
  "table",
  "taskItem",
  "epicBlock",
  "userStory",
]);

/** True if the doc has any non-whitespace text or any content-bearing node. */
function docHasContent(doc: unknown): boolean {
  if (!doc || typeof doc !== "object") return false;
  const node = doc as { type?: string; text?: string; content?: unknown[] };
  if (typeof node.text === "string" && node.text.trim().length > 0) {
    return true;
  }
  if (node.type && CONTENTFUL_NODE_TYPES.has(node.type)) return true;
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      if (docHasContent(child)) return true;
    }
  }
  return false;
}

/**
 * A doc is "empty" when it carries nothing meaningful — null, or only empty
 * paragraphs. Used by the clobber guard so a blank editor (e.g. collab failed
 * to sync) can't overwrite real stored content.
 */
function isEmptyDoc(doc: unknown): boolean {
  return !docHasContent(doc);
}

/**
 * Structural equality robust to object-key reordering. We need it because
 * Postgres `jsonb` normalizes keys alphabetically on read, while the editor
 * emits them in TipTap's natural order — naive JSON.stringify on the two
 * yields different strings even when the documents are identical.
 */
function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return stableStringify(a) === stableStringify(b);
  } catch {
    return false;
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
    .join(",")}}`;
}
