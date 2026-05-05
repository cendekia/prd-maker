import Link from "next/link";
import { redirect } from "next/navigation";

import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, presenceColorFor } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
  title: "Get started — PRD Maker",
};

export default async function OnboardingPage() {
  const user = await requireUser();
  const workspaces = await listUserWorkspaces(user.id);
  if (workspaces.length > 0) {
    redirect(`/${workspaces[0].workspace.slug}`);
  }

  const invites = await listPendingInvitesForEmail(user.email);

  return (
    <div className="relative flex min-h-screen flex-col items-center bg-bg-subtle px-4 py-12">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Link href="/" className="mb-8" aria-label="PRD Maker">
        <Logo variant="wordmark" size={28} />
      </Link>

      <div className="w-full max-w-md space-y-6">
        <div>
          <h1 className="t-h2">Welcome to PRD Maker</h1>
          <p className="mt-1 text-[13px] text-fg-3">
            Create a workspace to get started, or accept a pending invite.
          </p>
        </div>

        {invites.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Pending invites</CardTitle>
              <CardDescription>
                You&apos;ve been invited to join the following workspace
                {invites.length > 1 ? "s" : ""}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {invites.map((invite) => {
                const inviterName =
                  invite.createdBy.name ?? invite.createdBy.email;
                return (
                  <div
                    key={invite.id}
                    className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border bg-bg-subtle px-3 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar
                        name={inviterName}
                        size="lg"
                        presenceColor={presenceColorFor(invite.id)}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-fg-1">
                          {invite.workspace.name}
                        </p>
                        <p className="truncate text-[12px] text-fg-3">
                          From {inviterName} ·{" "}
                          <Badge
                            variant="muted"
                            className="text-[10px] py-0 px-1.5"
                          >
                            {invite.role[0] + invite.role.slice(1).toLowerCase()}
                          </Badge>
                        </p>
                      </div>
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
                );
              })}
            </CardContent>
          </Card>
        ) : null}

        {invites.length > 0 ? (
          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="t-label">or</span>
            <Separator className="flex-1" />
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Create a workspace</CardTitle>
            <CardDescription>
              A workspace is where your team writes and collaborates on PRDs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OnboardingForm />
          </CardContent>
          <CardFooter>
            <p className="text-[12px] text-fg-3">
              Signed in as{" "}
              <span className="text-fg-1 font-medium">{user.email}</span>.{" "}
              <Link
                href="/api/auth/signout"
                className="text-link underline-offset-2 hover:underline"
              >
                Sign out
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
