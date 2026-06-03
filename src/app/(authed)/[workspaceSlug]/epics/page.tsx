import { Role } from "@prisma/client";

import { EpicsBoard } from "@/components/epics/epics-board";
import { ROLE_RANK } from "@/lib/config";
import { listEpicsWithRollups } from "@/lib/epics";
import { requireWorkspace } from "@/lib/workspace";

interface PageProps {
  params: Promise<{ workspaceSlug: string }>;
}

export const metadata = { title: "Epics" };

export default async function EpicsPage({ params }: PageProps) {
  const { workspaceSlug } = await params;
  const { workspace, member } = await requireWorkspace(workspaceSlug);
  const epics = await listEpicsWithRollups(workspace.id);
  const canEdit = ROLE_RANK[member.role] >= ROLE_RANK[Role.EDITOR];

  return (
    <EpicsBoard
      workspaceId={workspace.id}
      workspaceSlug={workspace.slug}
      initialEpics={epics}
      canEdit={canEdit}
    />
  );
}
