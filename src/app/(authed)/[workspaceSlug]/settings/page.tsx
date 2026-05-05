import { Role } from "@prisma/client";

import { requireWorkspace } from "@/lib/workspace";

import { GeneralForm } from "./general-form";

interface PageProps {
  params: Promise<{ workspaceSlug: string }>;
}

export const metadata = { title: "General — Settings" };

export default async function GeneralSettingsPage({ params }: PageProps) {
  const { workspaceSlug } = await params;
  const { workspace, member } = await requireWorkspace(workspaceSlug);

  return (
    <GeneralForm
      workspaceSlug={workspace.slug}
      initialName={workspace.name}
      initialSlug={workspace.slug}
      isOwner={member.role === Role.OWNER}
    />
  );
}
