"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { FilePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { usePageTree } from "@/hooks/use-page-tree";

interface Props {
  workspaceId: string;
  workspaceSlug: string;
}

export function NewRootPageButton({ workspaceId, workspaceSlug }: Props) {
  const router = useRouter();
  const { createPage } = usePageTree(workspaceId, []);
  const [pending, startTransition] = useTransition();

  return (
    <Button
      onClick={() =>
        startTransition(async () => {
          try {
            const page = await createPage({ title: "Untitled" });
            router.push(`/${workspaceSlug}/p/${page.id}`);
          } catch (err) {
            alert((err as Error).message);
          }
        })
      }
      disabled={pending}
    >
      <FilePlus />
      {pending ? "Creating…" : "New page"}
    </Button>
  );
}
