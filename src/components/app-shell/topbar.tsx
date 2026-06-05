"use client";

import { Globe, Menu, PanelLeft, PanelRight, Search, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { useCommandPalette } from "@/hooks/use-command-palette";

import { AccountMenu } from "./account-menu";
import { PresenceAvatars } from "./presence-avatars";

interface Props {
  workspaceName: string;
  pageTitle?: string | null;
  sectionLabel?: string | null;
  onToggleSidebar: () => void;
  onToggleAi: () => void;
  sidebarOpen: boolean;
  aiPanelOpen: boolean;
  user: { name: string | null; email: string };
  workspaceSlug: string;
  /** Below the `md` breakpoint the hamburger opens the nav drawer and the
   *  desktop action cluster is hidden. */
  isMobile?: boolean;
}

export function TopBar({
  workspaceName,
  pageTitle,
  sectionLabel,
  onToggleSidebar,
  onToggleAi,
  sidebarOpen,
  aiPanelOpen,
  user,
  workspaceSlug,
  isMobile = false,
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
        aria-label={
          isMobile
            ? sidebarOpen
              ? "Close menu"
              : "Open menu"
            : sidebarOpen
              ? "Hide sidebar"
              : "Show sidebar"
        }
        aria-pressed={sidebarOpen}
        onClick={onToggleSidebar}
      >
        {isMobile ? <Menu /> : <PanelLeft />}
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
        <div className="mr-1 hidden md:flex">
          <PresenceAvatars />
        </div>
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
        {/* Page actions + AI toggle are desktop-only; on mobile the bar stays
            a hamburger, breadcrumb, search, and the account menu. */}
        <div className="hidden items-center gap-2 md:flex">
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
        </div>
        <NotificationBell />
        <AccountMenu user={user} workspaceSlug={workspaceSlug} />
      </div>
    </header>
  );
}
