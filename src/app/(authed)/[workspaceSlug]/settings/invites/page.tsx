import { Role } from "@prisma/client";

import { db } from "@/lib/db";
import { APP_URL } from "@/lib/config";
import { requireWorkspace } from "@/lib/workspace";

import { InviteForm } from "./invite-form";
import { InviteRow } from "./invite-row";

interface PageProps {
  params: Promise<{ workspaceSlug: string }>;
}

export const metadata = { title: "Invites — Settings" };

export default async function InvitesPage({ params }: PageProps) {
  const { workspaceSlug } = await params;
  const { workspace, member } = await requireWorkspace(workspaceSlug);

  const invites = await db.workspaceInvite.findMany({
    where: { workspaceId: workspace.id, acceptedAt: null },
    orderBy: { createdAt: "desc" },
  });

  const isOwner = member.role === Role.OWNER;

  return (
    <div className="space-y-6">
      {isOwner ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Invite a teammate</h2>
          <InviteForm workspaceSlug={workspace.slug} />
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">
          Only owners can send invites.
        </p>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Pending invites</h2>
        {invites.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending invites.</p>
        ) : (
          <div className="space-y-2">
            {invites.map((invite) => (
              <InviteRow
                key={invite.id}
                workspaceSlug={workspace.slug}
                canRevoke={isOwner}
                invite={{
                  id: invite.id,
                  email: invite.email,
                  role: invite.role,
                  acceptUrl: `${APP_URL}/invite/${invite.token}`,
                  expiresAt: invite.expiresAt.toISOString(),
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
