"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { PanelLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CommandPaletteProvider } from "@/components/command-palette";
import { PresenceProvider } from "@/hooks/use-presence";
import { useIsMobile } from "@/hooks/use-is-mobile";
import type { PageTreeNode, WorkspaceSummary } from "@/lib/types";

import { AIPanel } from "./ai-panel";
import { MobileDrawer } from "./mobile-drawer";
import { Sidebar } from "./sidebar";
import { TopBar } from "./topbar";

interface Props {
  workspace: { id: string; name: string; slug: string };
  workspaces: WorkspaceSummary[];
  initialTree: PageTreeNode[];
  user: { email: string; name: string | null };
  children: React.ReactNode;
}

export function AppShell({
  workspace,
  workspaces,
  initialTree,
  user,
  children,
}: Props) {
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const pathname = usePathname() ?? "";

  // Close the mobile nav drawer whenever the route changes (e.g. the user
  // tapped a page in the tree).
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Derive a section label for the breadcrumb (Settings, etc).
  const section = sectionLabelFor(pathname, workspace.slug);

  const sidebar = (
    <Sidebar
      workspace={workspace}
      workspaces={workspaces}
      initialTree={initialTree}
      userEmail={user.email}
      userName={user.name}
    />
  );

  return (
    <CommandPaletteProvider
      workspaceId={workspace.id}
      workspaceSlug={workspace.slug}
    >
    <PresenceProvider>
    <div className="flex h-screen w-screen overflow-hidden bg-background text-fg-1">
      {/* Desktop: inline sidebar, or a thin collapsed rail. On mobile the tree
          lives in the off-canvas drawer rendered below instead. */}
      {!isMobile ? (
        sidebarOpen ? (
          sidebar
        ) : (
          <div
            className="flex shrink-0 flex-col items-center border-r bg-bg-sidebar py-2"
            style={{ width: 40 }}
          >
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Show sidebar"
              onClick={() => setSidebarOpen(true)}
            >
              <PanelLeft />
            </Button>
          </div>
        )
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          workspaceName={workspace.name}
          sectionLabel={section}
          isMobile={isMobile}
          onToggleSidebar={
            isMobile
              ? () => setDrawerOpen((o) => !o)
              : () => setSidebarOpen((o) => !o)
          }
          onToggleAi={() => setAiPanelOpen((o) => !o)}
          sidebarOpen={isMobile ? drawerOpen : sidebarOpen}
          aiPanelOpen={aiPanelOpen}
        />
        <main className="min-h-0 flex-1 overflow-y-auto bg-background">
          {children}
        </main>
      </div>

      {/* AI panel is desktop-only — hidden entirely on mobile. */}
      {!isMobile && aiPanelOpen ? (
        <AIPanel onClose={() => setAiPanelOpen(false)} />
      ) : null}
    </div>

    {isMobile ? (
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        {sidebar}
      </MobileDrawer>
    ) : null}
    </PresenceProvider>
    </CommandPaletteProvider>
  );
}

function sectionLabelFor(pathname: string, slug: string): string | null {
  const base = `/${slug}`;
  if (pathname === base) return null;
  const tail = pathname.slice(base.length + 1).split("/")[0];
  switch (tail) {
    case "settings":
      return "Settings";
    case "p":
      return null; // page title is a separate breadcrumb segment
    default:
      return null;
  }
}
