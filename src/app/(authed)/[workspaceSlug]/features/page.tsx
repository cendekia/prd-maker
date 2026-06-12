import { Role } from "@prisma/client";

import { FeaturesSurface } from "@/components/agent/features-surface";
import { getSuggestionQueue, listGraph } from "@/lib/agent/features";
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
  const [graph, queue] = await Promise.all([
    listGraph(workspace.id),
    getSuggestionQueue(workspace.id),
  ]);

  return (
    <FeaturesSurface
      workspaceId={workspace.id}
      workspaceSlug={workspace.slug}
      initialGraph={graph}
      initialQueue={queue}
      initialTab={tab ?? null}
      initialFeatureId={feature ?? null}
      canEdit={ROLE_RANK[member.role] >= ROLE_RANK[Role.EDITOR]}
      canDelete={member.role === Role.OWNER}
    />
  );
}
