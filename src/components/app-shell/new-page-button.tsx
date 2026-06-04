"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TemplatePicker } from "@/components/templates/template-picker";

interface Props {
  workspaceId: string;
  /** Create a page from the chosen template (null = blank) and navigate to it. */
  onCreate: (templateId: string | null, title: string) => Promise<void>;
}

/** Sidebar "+" that opens the template picker instead of creating a blank page
 * directly. */
export function NewPageButton({ workspaceId, onCreate }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="New page"
        onClick={() => setOpen(true)}
      >
        <Plus />
      </Button>
      {open ? (
        <TemplatePicker
          workspaceId={workspaceId}
          onClose={() => setOpen(false)}
          onSelect={async (templateId, title) => {
            await onCreate(templateId, title);
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
