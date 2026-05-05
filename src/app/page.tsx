import Link from "next/link";
import { redirect } from "next/navigation";

import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
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
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center justify-between px-6">
        <Logo variant="wordmark" size={26} />
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Button asChild variant="ghost" size="sm">
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/sign-in">Get started</Link>
          </Button>
        </div>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <span className="t-label mb-4">PRD Maker</span>
        <h1 className="t-h1 max-w-2xl text-fg-1">
          Where product teams write PRDs together — with an AI that knows the
          spec.
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-[22px] text-fg-2">
          A Confluence-style editor for Product Requirements Documents.
          Real-time multiplayer, version history, and an integrated AI panel
          that drafts, critiques, and answers questions — using your own API
          key.
        </p>
        <div className="mt-8 flex gap-2">
          <Button asChild size="lg">
            <Link href="/sign-in">Get started</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/pricing">See pricing</Link>
          </Button>
        </div>
      </main>
      <footer className="px-6 py-6 text-center">
        <p className="text-[12px] text-fg-3">
          © {new Date().getFullYear()} PRD Maker
        </p>
      </footer>
    </div>
  );
}
