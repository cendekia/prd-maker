import type { Editor as TipTapEditor } from "@tiptap/core";
import { marked } from "marked";

/**
 * Snapshot-then-apply orchestrator for AI writes into a page (Step 21).
 *
 * Order is the whole point: we POST to `/api/ai/apply` first, which takes the
 * PRE_AI snapshot server-side. We touch the editor ONLY if that call succeeds.
 * If the snapshot fails (or access is denied), we surface the error and the
 * document is left untouched — there is no code path that writes without a
 * successful snapshot first.
 *
 * The applied content is appended (non-destructive): the PRE_AI snapshot plus
 * append means nothing the user wrote is ever lost.
 */
export async function applyAiEditToPage({
  pageId,
  markdown,
  editor,
}: {
  pageId: string;
  markdown: string;
  editor: TipTapEditor | null;
}): Promise<{ ok: boolean; error?: string }> {
  if (!editor) {
    return { ok: false, error: "The editor isn't ready yet." };
  }
  if (!editor.isEditable) {
    return { ok: false, error: "This page is read-only." };
  }

  // 1. Snapshot the current live state first. No snapshot → no write.
  let res: Response;
  try {
    res = await fetch("/api/ai/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pageId, currentJson: editor.getJSON() }),
    });
  } catch {
    return { ok: false, error: "Couldn't reach the server. Try again." };
  }
  if (!res.ok) {
    const data: { message?: string } = await res.json().catch(() => ({}));
    return { ok: false, error: data.message ?? "Couldn't snapshot the page." };
  }

  // 2. Snapshot succeeded — now apply. Convert the AI's Markdown to HTML and
  // let TipTap parse it into nodes against the live schema, appended at the end.
  try {
    const html = (await marked.parse(markdown.trim())) as string;
    editor
      .chain()
      .focus("end")
      .insertContentAt(editor.state.doc.content.size, html, {
        parseOptions: { preserveWhitespace: false },
      })
      .run();
    return { ok: true };
  } catch {
    // The snapshot exists, so the user can recover, but the write didn't land.
    return { ok: false, error: "Couldn't apply the content to the page." };
  }
}
