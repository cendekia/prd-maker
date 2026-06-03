import { notFound } from "next/navigation";
import { Role } from "@prisma/client";

import { env } from "@/env";
import type { PageAgileInitial } from "@/lib/agile";
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
      isPublished: true,
      publicSlug: true,
      epicId: true,
      agileStatus: true,
      priority: true,
      storyPoints: true,
      targetSprint: true,
      assigneeId: true,
      externalUrl: true,
      epic: { select: { id: true, key: true, name: true, color: true } },
      assignee: { select: { id: true, name: true, email: true, image: true } },
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
          avatarUrl: user.image ?? null,
        }),
      }
    : null;

  const agile: PageAgileInitial = {
    epicId: page.epicId,
    agileStatus: page.agileStatus,
    priority: page.priority,
    storyPoints: page.storyPoints,
    targetSprint: page.targetSprint,
    assigneeId: page.assigneeId,
    externalUrl: page.externalUrl,
    epic: page.epic,
    assignee: page.assignee,
  };

  return (
    <PageEditor
      pageId={page.id}
      title={page.title}
      initialContent={(page.contentJson as object | null) ?? null}
      editable={editable}
      workspaceId={workspace.id}
      workspaceSlug={workspace.slug}
      currentUserId={user.id}
      isOwner={access.role === Role.OWNER}
      collab={collab}
      isPublished={page.isPublished}
      publicSlug={page.publicSlug}
      publicBaseUrl={env.NEXT_PUBLIC_APP_URL}
      agile={agile}
    />
  );
}
