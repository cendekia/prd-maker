"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { PanelLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PageTreeNode, WorkspaceSummary } from "@/lib/types";

import { AIPanel } from "./ai-panel";
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const pathname = usePathname() ?? "";

  // Derive a section label for the breadcrumb (Settings, etc).
  const section = sectionLabelFor(pathname, workspace.slug);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-fg-1">
      {sidebarOpen ? (
        <Sidebar
          workspace={workspace}
          workspaces={workspaces}
          initialTree={initialTree}
          userEmail={user.email}
          userName={user.name}
        />
      ) : (
        <div className="flex shrink-0 flex-col items-center border-r bg-bg-sidebar py-2" style={{ width: 40 }}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Show sidebar"
            onClick={() => setSidebarOpen(true)}
          >
            <PanelLeft />
          </Button>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          workspaceName={workspace.name}
          sectionLabel={section}
          onToggleSidebar={() => setSidebarOpen((o) => !o)}
          onToggleAi={() => setAiPanelOpen((o) => !o)}
          sidebarOpen={sidebarOpen}
          aiPanelOpen={aiPanelOpen}
        />
        <main className="min-h-0 flex-1 overflow-y-auto bg-background">
          {children}
        </main>
      </div>

      {aiPanelOpen ? <AIPanel onClose={() => setAiPanelOpen(false)} /> : null}
    </div>
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
