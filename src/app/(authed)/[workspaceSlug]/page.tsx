import Link from "next/link";
import { FilePlus, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";

interface PageProps {
  params: Promise<{ workspaceSlug: string }>;
}

export default async function WorkspaceHomePage({ params }: PageProps) {
  const { workspaceSlug } = await params;

  return (
    <div className="mx-auto w-full max-w-[var(--content-max-width)] px-6 py-16">
      <span className="t-label">Workspace</span>
      <h1 className="t-h1 mt-3">Welcome.</h1>
      <p className="mt-3 text-[15px] leading-[22px] text-fg-2">
        The page tree, editor, and AI panel land in steps 9 and 10. While
        you&apos;re here, you can manage members, send invites, or review
        workspace settings.
      </p>
      <div className="mt-8 flex flex-wrap gap-2">
        <Button disabled>
          <FilePlus />
          New page
        </Button>
        <Button asChild variant="outline">
          <Link href={`/${workspaceSlug}/settings`}>
            <Settings />
            Open settings
          </Link>
        </Button>
      </div>
      <div className="mt-12 rounded-[var(--radius-lg)] border border-dashed bg-bg-subtle p-6">
        <span className="t-label">Coming soon</span>
        <p className="mt-2 text-[14px] text-fg-2">
          The TipTap editor, live multiplayer cursors via Yjs, and the AI panel
          arrive in subsequent steps of the development plan.
        </p>
      </div>
    </div>
  );
}
