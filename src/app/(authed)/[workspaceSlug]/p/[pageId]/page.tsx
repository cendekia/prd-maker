import { notFound } from "next/navigation";
import { Role } from "@prisma/client";

import { env } from "@/env";
import { db } from "@/lib/db";
import { issueCollabToken } from "@/lib/collab-token";
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

  // Mint the collab JWT server-side so the editor can connect immediately
  // without a client round-trip. If COLLAB_SECRET isn't configured (local
  // setups without the Hocuspocus service running), fall back to solo mode.
  const collab = env.COLLAB_SECRET
    ? {
        url: env.NEXT_PUBLIC_COLLAB_URL,
        ...issueCollabToken({
          pageId: page.id,
          userId: user.id,
          role: access.role,
          name: user.name ?? user.email ?? "Anonymous",
        }),
      }
    : null;

  return (
    <PageEditor
      pageId={page.id}
      title={page.title}
      initialContent={(page.contentJson as object | null) ?? null}
      editable={editable}
      workspaceId={workspace.id}
      workspaceSlug={workspace.slug}
      collab={collab}
    />
  );
}
