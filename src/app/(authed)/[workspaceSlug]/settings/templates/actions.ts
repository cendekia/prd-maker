"use server";

import { revalidatePath } from "next/cache";
import { Prisma, Role } from "@prisma/client";

import { db } from "@/lib/db";
import { extractText } from "@/lib/editor-text";
import { requireWorkspace } from "@/lib/workspace";

interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

/** Publish an existing page's content as a reusable workspace template. */
export async function publishTemplateAction(
  workspaceSlug: string,
  pageId: string,
  name: string,
  description: string,
): Promise<ActionResult> {
  const { workspace, member } = await requireWorkspace(workspaceSlug);
  if (member.role !== Role.OWNER) {
    return { ok: false, error: "Only owners can publish templates." };
  }
  const trimmedName = name.trim();
  if (trimmedName.length < 1 || trimmedName.length > 80) {
    return { ok: false, fieldErrors: { name: "Name must be 1–80 characters." } };
  }
  if (!pageId) {
    return { ok: false, fieldErrors: { pageId: "Choose a page to base the template on." } };
  }
  const page = await db.page.findUnique({
    where: { id: pageId },
    select: { workspaceId: true, contentJson: true },
  });
  if (!page || page.workspaceId !== workspace.id) {
    return { ok: false, fieldErrors: { pageId: "Page not found." } };
  }
  // A template is a point-in-time copy of the page. Publishing a page whose
  // content was never saved (contentJson still null, or an empty doc) would
  // silently bake a blank template that only surfaces at create time — refuse.
  if (!page.contentJson || extractText(page.contentJson).length === 0) {
    return {
      ok: false,
      fieldErrors: {
        pageId:
          "That page has no saved content yet — open it, add some content, and try again.",
      },
    };
  }
  const contentJson = page.contentJson as Prisma.InputJsonValue;
  await db.template.create({
    data: {
      workspaceId: workspace.id,
      name: trimmedName,
      description: description.trim() || null,
      contentJson,
    },
  });
  revalidatePath(`/${workspace.slug}/settings/templates`);
  return { ok: true };
}

/** Delete a workspace template. System templates (workspaceId null) can't be
 * deleted — they never match the workspace filter. */
export async function deleteTemplateAction(
  workspaceSlug: string,
  templateId: string,
): Promise<ActionResult> {
  const { workspace, member } = await requireWorkspace(workspaceSlug);
  if (member.role !== Role.OWNER) {
    return { ok: false, error: "Only owners can delete templates." };
  }
  const tpl = await db.template.findUnique({
    where: { id: templateId },
    select: { workspaceId: true },
  });
  if (!tpl || tpl.workspaceId !== workspace.id) {
    return { ok: false, error: "Template not found." };
  }
  await db.template.delete({ where: { id: templateId } });
  revalidatePath(`/${workspace.slug}/settings/templates`);
  return { ok: true };
}
