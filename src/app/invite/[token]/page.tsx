import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/lib/db";
import { getSession } from "@/lib/workspace";

import { acceptInviteAction } from "./actions";

interface PageProps {
  params: Promise<{ token: string }>;
}

export const metadata = { title: "Accept invite — PRDMaker" };

export default async function InvitePage({ params }: PageProps) {
  const { token } = await params;
  const invite = await db.workspaceInvite.findUnique({
    where: { token },
    include: {
      workspace: { select: { name: true, slug: true } },
      createdBy: { select: { name: true, email: true } },
    },
  });

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Workspace invite</CardTitle>
          {invite ? (
            <CardDescription>
              {invite.createdBy.name ?? invite.createdBy.email} invited you to
              join <strong>{invite.workspace.name}</strong> as a{" "}
              {invite.role.toLowerCase()}.
            </CardDescription>
          ) : (
            <CardDescription>This invite link is invalid.</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <InviteCta token={token} invite={invite} />
        </CardContent>
      </Card>
    </div>
  );
}

async function InviteCta({
  token,
  invite,
}: {
  token: string;
  invite: { email: string; expiresAt: Date; acceptedAt: Date | null } | null;
}) {
  const session = await getSession();

  if (!invite) {
    return (
      <Button asChild className="w-full">
        <Link href="/sign-in">Go to sign in</Link>
      </Button>
    );
  }
  if (invite.acceptedAt) {
    return (
      <p className="text-sm text-muted-foreground">
        This invite has already been accepted.
      </p>
    );
  }
  if (invite.expiresAt < new Date()) {
    return (
      <p className="text-sm text-destructive">
        This invite expired on {invite.expiresAt.toLocaleDateString()}.
      </p>
    );
  }

  if (!session?.user) {
    const next = `/invite/${token}`;
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Sign in as <span className="text-foreground">{invite.email}</span> to accept.
        </p>
        <Button asChild className="w-full">
          <Link href={`/sign-in?callbackUrl=${encodeURIComponent(next)}`}>
            Sign in
          </Link>
        </Button>
      </div>
    );
  }

  if (session.user.email?.toLowerCase() !== invite.email.toLowerCase()) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">
          You&apos;re signed in as {session.user.email}, but this invite was sent
          to {invite.email}.
        </p>
        <Button asChild variant="outline" className="w-full">
          <Link href="/api/auth/signout">Sign out</Link>
        </Button>
      </div>
    );
  }

  return (
    <form
      action={async () => {
        "use server";
        await acceptInviteAction(token);
      }}
    >
      <Button type="submit" className="w-full">
        Accept invite
      </Button>
    </form>
  );
}
