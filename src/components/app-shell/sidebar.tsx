"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Layers, Network, Search, Settings } from "lucide-react";

import { usePageTree } from "@/hooks/use-page-tree";
import type { PageTreeNode, WorkspaceSummary } from "@/lib/types";

import { NewPageButton } from "./new-page-button";
import { PageTree } from "./page-tree";
import { WorkspaceSwitcher } from "./workspace-switcher";

interface Props {
  workspace: { id: string; name: string; slug: string };
  workspaces: WorkspaceSummary[];
  initialTree: PageTreeNode[];
  userEmail: string;
  userName: string | null;
  /** Pending agent suggestions — badge on the Features entry (Step 50). */
  suggestionCount?: number;
}

export function Sidebar({
  workspace,
  workspaces,
  initialTree,
  userEmail,
  userName,
  suggestionCount = 0,
}: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const { createPage } = usePageTree(workspace.id, initialTree);

  async function handleCreateRootPage(templateId: string | null, title: string) {
    try {
      const page = await createPage({ title, templateId });
      router.push(`/${workspace.slug}/p/${page.id}`);
    } catch (err) {
      alert((err as Error).message);
    }
  }

  return (
    <aside
      className="flex shrink-0 flex-col gap-3 border-r bg-bg-sidebar"
      style={{ width: "var(--sidebar-width)" }}
    >
      <div className="px-3 pt-3">
        <WorkspaceSwitcher current={workspace} workspaces={workspaces} />
      </div>

      <div className="flex items-center gap-1.5 px-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-fg-4" />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search pages…"
            className="h-7 w-full rounded-[var(--radius-sm)] border bg-background pl-7 pr-2 text-[12px] text-fg-1 placeholder:text-fg-4 focus:border-ring focus:outline-none focus-visible:shadow-[var(--shadow-focus)]"
          />
        </div>
        <NewPageButton workspaceId={workspace.id} onCreate={handleCreateRootPage} />
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        <PageTree
          workspaceId={workspace.id}
          workspaceSlug={workspace.slug}
          initialTree={initialTree}
          filter={filter}
        />
      </div>

      <div className="border-t px-2 py-2">
        <Link
          href={`/${workspace.slug}/features`}
          className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-[12px] text-fg-2 hover:bg-bg-hover hover:text-fg-1"
        >
          <Network className="size-3.5" />
          Features
          {suggestionCount > 0 ? (
            <span
              title={`${suggestionCount} agent suggestions awaiting review`}
              className="ml-auto rounded-[var(--radius-full)] bg-brand-500 px-1.5 py-0.5 text-[10px] font-medium leading-none text-white"
            >
              {suggestionCount}
            </span>
          ) : null}
        </Link>
        <Link
          href={`/${workspace.slug}/epics`}
          className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-[12px] text-fg-2 hover:bg-bg-hover hover:text-fg-1"
        >
          <Layers className="size-3.5" />
          Epics
        </Link>
        <Link
          href={`/${workspace.slug}/settings`}
          className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-[12px] text-fg-2 hover:bg-bg-hover hover:text-fg-1"
        >
          <Settings className="size-3.5" />
          Settings
        </Link>
        <div className="mt-2 flex items-center justify-between gap-2 px-2 py-1.5">
          <div className="min-w-0">
            <p className="truncate text-[12px] font-medium text-fg-1">
              {userName ?? userEmail}
            </p>
            {userName ? (
              <p className="truncate text-[11px] text-fg-3">{userEmail}</p>
            ) : null}
          </div>
          <Link
            href="/api/auth/signout"
            className="text-[11px] text-fg-3 underline-offset-2 hover:text-fg-1 hover:underline"
          >
            Sign out
          </Link>
        </div>
      </div>
    </aside>
  );
}
