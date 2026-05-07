"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  ArrowRight,
  FileText,
  Mail,
  Settings,
  Users,
} from "lucide-react";

import {
  CommandPaletteContext,
  type CommandPaletteApi,
} from "@/hooks/use-command-palette";
import { cn } from "@/lib/utils";

interface PageResult {
  id: string;
  title: string;
}

interface Props {
  workspaceId: string;
  workspaceSlug: string;
  children: React.ReactNode;
}

/**
 * Provides the Cmd-K palette + global keyboard shortcut. Mount once near
 * the top of the workspace shell so every authed route can open it.
 *
 * Step 22 adds a second tab (full-text search over `Page.contentText`).
 */
export function CommandPaletteProvider({
  workspaceId,
  workspaceSlug,
  children,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PageResult[]>([]);
  const [loading, setLoading] = useState(false);

  // Global shortcut (Cmd-K / Ctrl-K).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isShortcut = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (isShortcut) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Reset state on close.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  // Fetch pages when the palette opens or the query changes.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const url = new URL(
      `/api/workspaces/${workspaceId}/pages/search`,
      window.location.origin,
    );
    if (query) url.searchParams.set("q", query);
    url.searchParams.set("limit", "8");
    fetch(url.toString())
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { results: PageResult[] }) => {
        if (cancelled) return;
        setResults(data.results);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, query, workspaceId]);

  const api: CommandPaletteApi = {
    open,
    setOpen,
    toggle: () => setOpen((o) => !o),
  };

  function go(href: string) {
    router.push(href);
    setOpen(false);
  }

  return (
    <CommandPaletteContext.Provider value={api}>
      {children}
      {open ? (
        <div
          className="fixed inset-0 z-[var(--z-modal)] flex items-start justify-center bg-[oklch(0.145_0_0_/_0.4)] px-4 pt-[12vh]"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-[var(--radius-xl)] border bg-popover shadow-[var(--shadow-xl)]"
            onClick={(e) => e.stopPropagation()}
          >
            <Command
              label="Command palette"
              shouldFilter={false}
              className="bg-transparent"
            >
              <div className="flex items-center gap-2.5 border-b px-4 py-3">
                <SearchIcon />
                <Command.Input
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Jump to page or section…"
                  className="flex-1 bg-transparent text-[14px] text-fg-1 placeholder:text-fg-4 focus:outline-none"
                  autoFocus
                />
                <kbd className="rounded-[var(--radius-xs)] border border-b-2 bg-bg px-1.5 py-0.5 text-[10px] font-medium text-fg-2 t-mono">
                  esc
                </kbd>
              </div>
              <Command.List className="max-h-80 overflow-y-auto p-1.5">
                {loading && results.length === 0 ? (
                  <div className="px-3 py-4 text-[12px] text-fg-3">Searching…</div>
                ) : null}

                {!loading && results.length === 0 ? (
                  <Command.Empty className="px-3 py-4 text-[12px] text-fg-3">
                    {query
                      ? `No pages match “${query}”.`
                      : "Type to search pages, or pick an action below."}
                  </Command.Empty>
                ) : null}

                {results.length > 0 ? (
                  <Command.Group
                    heading="Pages"
                    className="[&_[cmdk-group-heading]]:t-label [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-1.5"
                  >
                    {results.map((r, i) => (
                      <Command.Item
                        key={r.id}
                        value={`page:${r.id}:${r.title}`}
                        onSelect={() => go(`/${workspaceSlug}/p/${r.id}`)}
                        className={paletteItemClass}
                      >
                        <FileText className="size-3.5 text-fg-3" />
                        <span className="flex-1 truncate text-[13px] text-fg-1">
                          {r.title || "Untitled"}
                        </span>
                        {i === 0 ? <ReturnIcon /> : null}
                      </Command.Item>
                    ))}
                  </Command.Group>
                ) : null}

                <Command.Group
                  heading="Actions"
                  className="[&_[cmdk-group-heading]]:t-label [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-1.5"
                >
                  <Command.Item
                    value="action:settings"
                    onSelect={() => go(`/${workspaceSlug}/settings`)}
                    className={paletteItemClass}
                  >
                    <Settings className="size-3.5 text-fg-3" />
                    <span className="flex-1 text-[13px]">Workspace settings</span>
                  </Command.Item>
                  <Command.Item
                    value="action:members"
                    onSelect={() => go(`/${workspaceSlug}/settings/members`)}
                    className={paletteItemClass}
                  >
                    <Users className="size-3.5 text-fg-3" />
                    <span className="flex-1 text-[13px]">Members</span>
                  </Command.Item>
                  <Command.Item
                    value="action:invites"
                    onSelect={() => go(`/${workspaceSlug}/settings/invites`)}
                    className={paletteItemClass}
                  >
                    <Mail className="size-3.5 text-fg-3" />
                    <span className="flex-1 text-[13px]">Invite a teammate</span>
                  </Command.Item>
                </Command.Group>
              </Command.List>
            </Command>
          </div>
        </div>
      ) : null}
    </CommandPaletteContext.Provider>
  );
}

const paletteItemClass = cn(
  "flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-fg-2 cursor-pointer",
  "data-[selected=true]:bg-bg-active data-[selected=true]:text-fg-1",
  "aria-selected:bg-bg-active aria-selected:text-fg-1",
);

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="text-fg-3"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function ReturnIcon() {
  return <ArrowRight className="size-3 text-fg-3" />;
}
