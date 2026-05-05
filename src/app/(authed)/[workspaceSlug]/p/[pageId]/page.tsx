import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";

import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/workspace";

interface PageProps {
  params: Promise<{ workspaceSlug: string; pageId: string }>;
}

export default async function PageEditorPage({ params }: PageProps) {
  const { workspaceSlug, pageId } = await params;
  const { workspace } = await requireWorkspace(workspaceSlug);

  const page = await db.page.findUnique({
    where: { id: pageId },
    select: {
      id: true,
      title: true,
      workspaceId: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!page || page.workspaceId !== workspace.id || page.archivedAt) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-[var(--content-max-width)] px-6 py-12">
      <span className="t-label">Page</span>
      <h1 className="t-h1 mt-3">{page.title}</h1>
      <p className="mt-2 text-[12px] text-fg-3">
        Created {new Date(page.createdAt).toLocaleDateString()} · Updated{" "}
        {new Date(page.updatedAt).toLocaleDateString()}
      </p>
      <div className="mt-12 rounded-[var(--radius-lg)] border border-dashed bg-bg-subtle p-6">
        <div className="flex items-center gap-2 text-[13px] font-medium text-fg-1">
          <Sparkles className="size-4 text-brand-500" />
          Editor coming in step 10
        </div>
        <p className="mt-2 text-[13px] leading-[18px] text-fg-2">
          The TipTap editor with slash commands, inline comments, and live
          collaboration arrives in steps 10 through 14. Until then the page is
          a placeholder — you can rename and archive it from the sidebar.
        </p>
      </div>
    </div>
  );
}
