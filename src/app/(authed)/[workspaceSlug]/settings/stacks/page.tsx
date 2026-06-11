import { Role } from "@prisma/client";

import { listStacks } from "@/lib/agent/stacks";
import { ROLE_RANK } from "@/lib/config";
import { requireWorkspace } from "@/lib/workspace";

import { StacksManager } from "./stacks-manager";

interface PageProps {
  params: Promise<{ workspaceSlug: string }>;
}

export const metadata = { title: "Stacks — Settings" };

export default async function StacksSettingsPage({ params }: PageProps) {
  const { workspaceSlug } = await params;
  const { workspace, member } = await requireWorkspace(workspaceSlug);
  const stacks = await listStacks(workspace.id);

  return (
    <StacksManager
      workspaceSlug={workspace.slug}
      stacks={stacks}
      canEdit={ROLE_RANK[member.role] >= ROLE_RANK[Role.EDITOR]}
      canDelete={member.role === Role.OWNER}
    />
  );
}
