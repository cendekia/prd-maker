import { Role } from "@prisma/client";

import { db } from "@/lib/db";
import { requireUser, requireWorkspace } from "@/lib/workspace";

import { MemberRow } from "./member-row";

interface PageProps {
  params: Promise<{ workspaceSlug: string }>;
}

export const metadata = { title: "Members — Settings" };

export default async function MembersPage({ params }: PageProps) {
  const { workspaceSlug } = await params;
  const { workspace, member: viewer } = await requireWorkspace(workspaceSlug);
  const user = await requireUser();

  const members = await db.workspaceMember.findMany({
    where: { workspaceId: workspace.id },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="t-label">
          {members.length} member{members.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="space-y-2">
        {members.map((m) => (
          <MemberRow
            key={m.id}
            workspaceSlug={workspace.slug}
            member={m}
            currentUserId={user.id}
            viewerIsOwner={viewer.role === Role.OWNER}
          />
        ))}
      </div>
    </div>
  );
}
