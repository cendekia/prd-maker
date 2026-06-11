import { Role } from "@prisma/client";

import { FeaturesSurface } from "@/components/agent/features-surface";
import { listGraph } from "@/lib/agent/features";
import { ROLE_RANK } from "@/lib/config";
import { requireWorkspace } from "@/lib/workspace";

interface PageProps {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ tab?: string; feature?: string }>;
}

export const metadata = { title: "Features" };

export default async function FeaturesPage({ params, searchParams }: PageProps) {
  const [{ workspaceSlug }, { tab, feature }] = await Promise.all([
    params,
    searchParams,
  ]);
  const { workspace, member } = await requireWorkspace(workspaceSlug);
  const graph = await listGraph(workspace.id);

  return (
    <FeaturesSurface
      workspaceId={workspace.id}
      workspaceSlug={workspace.slug}
      initialGraph={graph}
      initialTab={tab ?? null}
      initialFeatureId={feature ?? null}
      canEdit={ROLE_RANK[member.role] >= ROLE_RANK[Role.EDITOR]}
      canDelete={member.role === Role.OWNER}
    />
  );
}
