"use client";

import { Globe, MoreHorizontal, PanelLeft, PanelRight, Search, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useCommandPalette } from "@/hooks/use-command-palette";

import { PresenceAvatars } from "./presence-avatars";

interface Props {
  workspaceName: string;
  pageTitle?: string | null;
  sectionLabel?: string | null;
  onToggleSidebar: () => void;
  onToggleAi: () => void;
  sidebarOpen: boolean;
  aiPanelOpen: boolean;
}

export function TopBar({
  workspaceName,
  pageTitle,
  sectionLabel,
  onToggleSidebar,
  onToggleAi,
  sidebarOpen,
  aiPanelOpen,
}: Props) {
  const palette = useCommandPalette();
  const isMac =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <header
      className="flex shrink-0 items-center gap-3 border-b bg-background px-3"
      style={{ height: "var(--topbar-height)" }}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
        aria-pressed={sidebarOpen}
        onClick={onToggleSidebar}
      >
        <PanelLeft />
      </Button>

      <div className="flex min-w-0 items-center gap-1.5 text-[13px] text-fg-3">
        <span className="whitespace-nowrap">{workspaceName}</span>
        {sectionLabel ? (
          <>
            <span className="text-fg-4">/</span>
            <span className="whitespace-nowrap">{sectionLabel}</span>
          </>
        ) : null}
        {pageTitle ? (
          <>
            <span className="text-fg-4">/</span>
            <span className="truncate font-medium text-fg-1">{pageTitle}</span>
          </>
        ) : null}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <PresenceAvatars className="mr-1" />
        <Button
          variant="outline"
          size="sm"
          className="gap-2 text-fg-3"
          onClick={() => palette.setOpen(true)}
          aria-label="Open command palette"
        >
          <Search />
          <span className="hidden sm:inline">Search</span>
          <kbd className="hidden rounded-[var(--radius-xs)] border bg-bg-subtle px-1 py-0 text-[10px] font-medium text-fg-2 t-mono sm:inline-block">
            {isMac ? "⌘K" : "Ctrl K"}
          </kbd>
        </Button>
        <Button variant="outline" size="sm">
          <Globe />
          Share
        </Button>
        <Button size="sm">Publish</Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={aiPanelOpen ? "Hide AI panel" : "Show AI panel"}
          aria-pressed={aiPanelOpen}
          onClick={onToggleAi}
        >
          {aiPanelOpen ? <PanelRight /> : <Sparkles />}
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="More">
          <MoreHorizontal />
        </Button>
      </div>
    </header>
  );
}
