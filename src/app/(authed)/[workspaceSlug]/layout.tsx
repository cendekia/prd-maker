import Link from "next/link";
import { Globe, MoreHorizontal, PanelLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { requireWorkspace } from "@/lib/workspace";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}

/**
 * Step 9 replaces this with the three-pane app shell. For now it shows the
 * design system's top bar — workspace breadcrumb on the left, share/publish
 * affordances on the right — over a single content pane.
 */
export default async function WorkspaceLayout({ children, params }: LayoutProps) {
  const { workspaceSlug } = await params;
  const { workspace } = await requireWorkspace(workspaceSlug);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header
        className="flex h-12 items-center gap-3 border-b bg-background px-3"
        style={{ height: "var(--topbar-height)" }}
      >
        <Button variant="ghost" size="icon-sm" aria-label="Toggle sidebar">
          <PanelLeft />
        </Button>
        <Link
          href={`/${workspace.slug}`}
          className="flex items-center gap-2 text-[13px] text-fg-3 min-w-0"
        >
          <Logo variant="mark" size={20} />
          <span className="text-fg-1 font-medium truncate">{workspace.name}</span>
        </Link>
        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="outline" size="sm">
            <Globe />
            Share
          </Button>
          <Button size="sm">Publish</Button>
          <Button asChild variant="ghost" size="sm">
            <Link href={`/${workspace.slug}/settings`}>Settings</Link>
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="More">
            <MoreHorizontal />
          </Button>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
