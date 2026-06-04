import { Role } from "@prisma/client";

import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/workspace";

import { TemplatesManager } from "./templates-manager";

interface PageProps {
  params: Promise<{ workspaceSlug: string }>;
}

export const metadata = { title: "Templates — Settings" };

export default async function TemplatesSettingsPage({ params }: PageProps) {
  const { workspaceSlug } = await params;
  const { workspace, member } = await requireWorkspace(workspaceSlug);

  if (member.role !== Role.OWNER) {
    return (
      <p className="text-[13px] text-fg-3">
        Only workspace owners can manage templates.
      </p>
    );
  }

  const [templates, pages] = await Promise.all([
    db.template.findMany({
      where: { workspaceId: workspace.id },
      select: { id: true, name: true, description: true },
      orderBy: { createdAt: "desc" },
    }),
    db.page.findMany({
      where: { workspaceId: workspace.id, archivedAt: null },
      select: { id: true, title: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return (
    <TemplatesManager
      workspaceSlug={workspace.slug}
      pages={pages}
      templates={templates}
    />
  );
}
