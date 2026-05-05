import { FileText } from "lucide-react";

import { getPageTree } from "@/lib/pages";
import { requireWorkspace } from "@/lib/workspace";

import { NewRootPageButton } from "./new-root-page-button";

interface PageProps {
  params: Promise<{ workspaceSlug: string }>;
}

export default async function WorkspaceHomePage({ params }: PageProps) {
  const { workspaceSlug } = await params;
  const { workspace } = await requireWorkspace(workspaceSlug);
  const tree = await getPageTree(workspace.id);

  return (
    <div className="mx-auto w-full max-w-[var(--content-max-width)] px-6 py-16">
      <span className="t-label">Workspace</span>
      <h1 className="t-h1 mt-3">{workspace.name}</h1>
      <p className="mt-3 text-[15px] leading-[22px] text-fg-2">
        {tree.length === 0
          ? "No pages yet — start with a template or a blank page."
          : "Pick a page in the sidebar, or create a new one."}
      </p>
      <div className="mt-8">
        <NewRootPageButton workspaceId={workspace.id} workspaceSlug={workspace.slug} />
      </div>

      {tree.length > 0 ? (
        <div className="mt-12">
          <span className="t-label">Recent</span>
          <ul className="mt-3 divide-y border-t border-b">
            {tree.slice(0, 5).map((p) => (
              <li key={p.id}>
                <a
                  href={`/${workspaceSlug}/p/${p.id}`}
                  className="flex items-center gap-3 py-3 text-[14px] text-fg-1 hover:bg-bg-hover"
                >
                  <FileText className="size-4 text-fg-3" />
                  <span className="flex-1 truncate">{p.title}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
