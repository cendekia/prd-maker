"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";

import { enqueueExtractPage } from "@/lib/agent/jobs";
import { db } from "@/lib/db";
import { assertCanPublish, PlanGateError } from "@/lib/plan-gate";
import { requirePageAccess } from "@/lib/permissions";
import { isValidSlug, slugify } from "@/lib/slug";
import { requireUser } from "@/lib/workspace";

interface PublishInput {
  pageId: string;
  /** Optional custom slug; falls back to the page title slug. */
  slug?: string | null;
}

export interface PublishResult {
  ok: true;
  publicSlug: string;
}

export interface PublishError {
  ok: false;
  error: string;
  code?: string;
}

/**
 * Publish a page to a public, unauthenticated URL.
 *
 * Plan-gated (Step 25 will tighten): FREE workspaces can't publish.
 * Requires EDITOR on the page. Slug is unique workspace-wide via the
 * `Page.publicSlug @unique` constraint — on conflict we surface a clear
 * error rather than auto-incrementing, so the user can pick a different one.
 */
export async function publishPageAction(
  input: PublishInput,
): Promise<PublishResult | PublishError> {
  const user = await requireUser();
  let access;
  try {
    access = await requirePageAccess(input.pageId, user.id, Role.EDITOR);
  } catch {
    return { ok: false, error: "You don't have permission to publish this page." };
  }

  try {
    await assertCanPublish(access.workspaceId);
  } catch (e) {
    if (e instanceof PlanGateError) {
      return { ok: false, error: e.message, code: e.code };
    }
    throw e;
  }

  const page = await db.page.findUnique({
    where: { id: input.pageId },
    select: { id: true, title: true, publicSlug: true, workspaceId: true },
  });
  if (!page) return { ok: false, error: "Page not found." };

  let desired = (input.slug ?? page.publicSlug ?? slugify(page.title) ?? "")
    .toLowerCase()
    .trim();
  if (!desired) desired = `page-${page.id.slice(0, 8)}`;

  if (!isValidSlug(desired)) {
    return {
      ok: false,
      error:
        "Slug must be 1–40 lowercase letters/numbers/hyphens, and can't be a reserved word.",
    };
  }

  // Slug collisions across workspaces are possible — check existence first to
  // give a friendly error rather than a raw P2002.
  if (page.publicSlug !== desired) {
    const conflict = await db.page.findUnique({
      where: { publicSlug: desired },
      select: { id: true },
    });
    if (conflict && conflict.id !== page.id) {
      return { ok: false, error: `“${desired}” is already in use. Try another slug.` };
    }
  }

  await db.page.update({
    where: { id: page.id },
    data: { isPublished: true, publicSlug: desired },
  });

  // Publishing marks the PRD as settled — queue a feature-map re-extraction
  // (Step 49). Best-effort: never block the publish on it.
  try {
    await enqueueExtractPage({
      workspaceId: page.workspaceId,
      pageId: page.id,
      requestedById: user.id,
    });
  } catch {
    /* extraction is best-effort */
  }

  revalidatePath(`/p/${desired}`);
  return { ok: true, publicSlug: desired };
}

/** Unpublish — leaves the slug in place so re-publishing keeps the same URL. */
export async function unpublishPageAction(pageId: string): Promise<
  { ok: true } | PublishError
> {
  const user = await requireUser();
  try {
    await requirePageAccess(pageId, user.id, Role.EDITOR);
  } catch {
    return { ok: false, error: "You don't have permission to unpublish this page." };
  }

  const page = await db.page.findUnique({
    where: { id: pageId },
    select: { publicSlug: true },
  });

  await db.page.update({
    where: { id: pageId },
    data: { isPublished: false },
  });

  if (page?.publicSlug) {
    revalidatePath(`/p/${page.publicSlug}`);
  }
  return { ok: true };
}
