import { notFound } from "next/navigation";
import { Role } from "@prisma/client";

import { db } from "@/lib/db";
import { getPageAccess } from "@/lib/permissions";
import { requireUser, requireWorkspace } from "@/lib/workspace";

import { PageEditor } from "./page-editor";

interface PageProps {
  params: Promise<{ workspaceSlug: string; pageId: string }>;
}

export default async function PageEditorRoute({ params }: PageProps) {
  const { workspaceSlug, pageId } = await params;
  const { workspace } = await requireWorkspace(workspaceSlug);
  const user = await requireUser();

  const access = await getPageAccess(pageId, user.id);
  if (!access || access.workspaceId !== workspace.id) {
    notFound();
  }

  const page = await db.page.findUnique({
    where: { id: pageId },
    select: {
      id: true,
      title: true,
      contentJson: true,
      updatedAt: true,
      archivedAt: true,
    },
  });
  if (!page || page.archivedAt) notFound();

  const editable = access.role !== Role.VIEWER;

  return (
    <PageEditor
      pageId={page.id}
      title={page.title}
      initialContent={(page.contentJson as object | null) ?? null}
      editable={editable}
    />
  );
}
