import { NextResponse } from "next/server";
import { Role } from "@prisma/client";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { extractText } from "@/lib/editor-text";
import { getPageAccess } from "@/lib/permissions";

interface Params {
  params: Promise<{ pageId: string }>;
}

/**
 * Apply a template to an existing EMPTY page (Step 62).
 *
 * The server validates (EDITOR access, same-workspace-or-system template,
 * saved content still empty) and records `Page.templateId` — the page's
 * completeness-checklist target (Step 57). The template's content is returned
 * for the CLIENT to plant into the live editor (`setContent` flows through
 * y-prosemirror in collab, or the solo save path) — the server never writes
 * page content, mirroring the AI-apply split. The client follows up with a
 * MANUAL snapshot, which persists the planted content and queues extraction.
 */
export async function POST(req: Request, { params }: Params) {
  const { pageId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const access = await getPageAccess(pageId, session.user.id);
  if (!access) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }
  if (access.role === Role.VIEWER) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { templateId?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.templateId !== "string" || body.templateId.length === 0) {
    return NextResponse.json({ error: "templateId is required" }, { status: 400 });
  }

  const page = await db.page.findUnique({
    where: { id: pageId },
    select: { contentJson: true },
  });
  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }
  // Only ever pour into an empty page — applying over content is destructive
  // and stays out of scope (the affordance hides itself once content exists,
  // but the saved state is the authority).
  if (page.contentJson && extractText(page.contentJson).length > 0) {
    return NextResponse.json(
      { error: "This page already has content." },
      { status: 409 },
    );
  }

  const template = await db.template.findUnique({
    where: { id: body.templateId },
    select: { workspaceId: true, name: true, contentJson: true },
  });
  if (
    !template ||
    (template.workspaceId !== null && template.workspaceId !== access.workspaceId)
  ) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  await db.page.update({
    where: { id: pageId },
    data: { templateId: body.templateId },
  });

  return NextResponse.json({
    ok: true,
    template: {
      id: body.templateId,
      name: template.name,
      contentJson: template.contentJson,
    },
  });
}
