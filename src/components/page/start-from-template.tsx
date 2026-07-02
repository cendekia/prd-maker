"use client";

import { useEffect, useState } from "react";
import type { Editor as TipTapEditor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/react";
import { LayoutTemplate } from "lucide-react";

import { TemplatePicker } from "@/components/templates/template-picker";

/**
 * Confluence-style "start from a template" on an empty page (Step 62).
 *
 * Renders only while the live doc is empty and the editor is editable.
 * Applying = server call (validates + records `Page.templateId`, returns the
 * template content) → plant into the live editor with `setContent`, which
 * flows through y-prosemirror in collab or the solo save path — then
 * `onApplied` lets the host take its MANUAL snapshot (persist + extraction),
 * the same follow-up the AI apply path uses.
 */
export function StartFromTemplate({
  pageId,
  workspaceId,
  editor,
  editable,
  ready,
  onApplied,
}: {
  pageId: string;
  workspaceId: string;
  editor: TipTapEditor | null;
  editable: boolean;
  /**
   * Whether the live doc's emptiness can be trusted. A collab page with saved
   * content renders an empty doc until the provider syncs and seeds it — the
   * affordance must not key off that transient emptiness.
   */
  ready: boolean;
  onApplied?: () => void;
}) {
  const [docEmpty, setDocEmpty] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Track live emptiness so the affordance disappears the moment the user
  // (or a collaborator, or an applied template) puts anything in the doc.
  useEffect(() => {
    if (!editor) {
      setDocEmpty(false);
      return;
    }
    const update = () =>
      setDocEmpty(editor.state.doc.textContent.trim().length === 0);
    update();
    editor.on("update", update);
    return () => {
      editor.off("update", update);
    };
  }, [editor]);

  if (!editable || !editor || !ready || !docEmpty) return null;

  async function applyTemplate(templateId: string | null) {
    if (!templateId || !editor) return;
    const res = await fetch(`/api/pages/${pageId}/apply-template`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Rendered inline by the picker.
      throw new Error(data.error ?? "Couldn’t apply the template.");
    }
    editor.commands.setContent(
      data.template.contentJson as JSONContent,
      true,
    );
    setPickerOpen(false);
    onApplied?.();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="mb-4 flex w-full items-center gap-2 rounded-[var(--radius-md)] border border-dashed border-border-strong px-3 py-2 text-left text-[13px] text-fg-3 transition-colors hover:bg-bg-hover hover:text-fg-1"
      >
        <LayoutTemplate className="size-4 shrink-0 text-fg-4" />
        Start from a template…
      </button>
      {pickerOpen ? (
        <TemplatePicker
          workspaceId={workspaceId}
          mode="apply"
          onClose={() => setPickerOpen(false)}
          onSelect={applyTemplate}
        />
      ) : null}
    </>
  );
}
