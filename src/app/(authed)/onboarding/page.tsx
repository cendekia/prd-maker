import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  listPendingInvitesForEmail,
  listUserWorkspaces,
  requireUser,
} from "@/lib/workspace";

import { acceptInviteFromOnboardingAction } from "./actions";
import { OnboardingForm } from "./onboarding-form";

export const metadata = {
  title: "Get started — PRDMaker",
};

export default async function OnboardingPage() {
  const user = await requireUser();
  const workspaces = await listUserWorkspaces(user.id);
  if (workspaces.length > 0) {
    redirect(`/${workspaces[0].workspace.slug}`);
  }

  const invites = await listPendingInvitesForEmail(user.email);

  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome to PRDMaker
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a workspace to get started, or accept a pending invite.
        </p>
      </div>

      {invites.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pending invites</CardTitle>
            <CardDescription>
              You&apos;ve been invited to join the following workspace
              {invites.length > 1 ? "s" : ""}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {invite.workspace.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    Invited by{" "}
                    {invite.createdBy.name ?? invite.createdBy.email} ·{" "}
                    {invite.role.toLowerCase()}
                  </p>
                </div>
                <form
                  action={async () => {
                    "use server";
                    await acceptInviteFromOnboardingAction(invite.token);
                  }}
                >
                  <Button size="sm" type="submit">
                    Accept
                  </Button>
                </form>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {invites.length > 0 ? (
        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            or
          </span>
          <Separator className="flex-1" />
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create a workspace</CardTitle>
          <CardDescription>
            A workspace is where your team writes and collaborates on PRDs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OnboardingForm />
        </CardContent>
        <CardFooter>
          <p className="text-xs text-muted-foreground">
            Signed in as <span className="text-foreground">{user.email}</span>.{" "}
            <Link
              href="/api/auth/signout"
              className="underline-offset-4 hover:underline"
            >
              Sign out
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
