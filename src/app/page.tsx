import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getSession, listUserWorkspaces } from "@/lib/workspace";

export default async function Home() {
  const session = await getSession();
  if (session?.user?.id) {
    const workspaces = await listUserWorkspaces(session.user.id);
    if (workspaces.length > 0) {
      redirect(`/${workspaces[0].workspace.slug}`);
    }
    redirect("/onboarding");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">PRDMaker</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          A Confluence-style PRD editor with an integrated AI assistant.
        </p>
      </div>
      <div className="flex gap-2">
        <Button asChild>
          <Link href="/sign-in">Sign in</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/sign-in">Get started</Link>
        </Button>
      </div>
    </main>
  );
}
