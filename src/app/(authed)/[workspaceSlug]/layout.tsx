import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requireWorkspace } from "@/lib/workspace";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}

/**
 * Step 9 replaces this with the three-pane app shell. For now it just
 * authorizes membership and provides a thin top bar so settings/links work.
 */
export default async function WorkspaceLayout({ children, params }: LayoutProps) {
  const { workspaceSlug } = await params;
  const { workspace, member } = await requireWorkspace(workspaceSlug);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-12 items-center justify-between border-b px-4">
        <div className="flex items-center gap-3 text-sm">
          <Link href={`/${workspace.slug}`} className="font-medium">
            {workspace.name}
          </Link>
          <span className="text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground">
            {member.role.toLowerCase()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href={`/${workspace.slug}/settings`}>Settings</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/api/auth/signout">Sign out</Link>
          </Button>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
