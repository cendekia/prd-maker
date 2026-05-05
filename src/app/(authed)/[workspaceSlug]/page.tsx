import Link from "next/link";

import { Button } from "@/components/ui/button";

interface PageProps {
  params: Promise<{ workspaceSlug: string }>;
}

export default async function WorkspaceHomePage({ params }: PageProps) {
  const { workspaceSlug } = await params;

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Workspace home</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The page tree, editor, and AI panel land in steps 9–10. For now you can
        manage members and invites in settings.
      </p>
      <div className="mt-6 flex gap-2">
        <Button asChild>
          <Link href={`/${workspaceSlug}/settings`}>Open settings</Link>
        </Button>
      </div>
    </div>
  );
}
