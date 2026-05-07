import "server-only";

import { Prisma, VersionKind, type PageVersion } from "@prisma/client";

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
}

const KIND_VALUES: Record<SnapshotKind, VersionKind> = {
  AUTO: VersionKind.AUTO,
  MANUAL: VersionKind.MANUAL,
  PRE_AI: VersionKind.PRE_AI,
};

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
    select: { id: true, contentJson: true, yDocState: true, archivedAt: true },
  });
  if (!page) throw new Error(`Page ${pageId} not found`);
  if (page.archivedAt) throw new Error(`Page ${pageId} is archived`);

  // Resolve the JSON to snapshot. Caller-provided JSON wins because it
  // reflects the live editor state; otherwise fall back to whatever was
  // last persisted via the legacy save path.
  const json =
    contentJson !== undefined && contentJson !== null
      ? (contentJson as Prisma.InputJsonValue)
      : (page.contentJson as Prisma.InputJsonValue | null) ?? ({
          type: "doc",
          content: [{ type: "paragraph" }],
        } as Prisma.InputJsonValue);

  // Dedupe AUTO snapshots only.
  if (versionKind === VersionKind.AUTO) {
    const last = await db.pageVersion.findFirst({
      where: { pageId, kind: VersionKind.AUTO },
      orderBy: { createdAt: "desc" },
      select: { id: true, snapshotJson: true, kind: true, pageId: true, yDocState: true, createdById: true, createdAt: true },
    });
    if (last && jsonEqual(last.snapshotJson, json)) {
      return { version: last as PageVersion, created: false };
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
  // so search and other consumers see it. Skip when no JSON was supplied —
  // we don't want a cron call to overwrite anything based on stale state.
  if (contentJson !== undefined && contentJson !== null) {
    await db.page.update({
      where: { id: pageId },
      data: {
        contentJson: json,
        contentText: extractText(contentJson),
      },
    });
  }

  return { version, created: true };
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
