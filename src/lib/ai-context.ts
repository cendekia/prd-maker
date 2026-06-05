import "server-only";

/**
 * Build the system prompt for the AI side-panel chat (Step 20). It grounds the
 * assistant in the current PRD by embedding the page's plain-text projection
 * (`Page.contentText`). The text is bounded so a huge document can't blow the
 * token budget — the assistant still gets the title and a generous prefix.
 */

const MAX_CONTEXT_CHARS = 12_000;

export function buildPageSystemPrompt({
  title,
  text,
}: {
  title: string;
  text: string;
}): string {
  const clean = text.trim();
  const doc =
    clean.length > MAX_CONTEXT_CHARS
      ? `${clean.slice(0, MAX_CONTEXT_CHARS)}\n…[document truncated]`
      : clean || "(The document is currently empty.)";

  return [
    "You are an AI assistant embedded in PRDMaker, a collaborative product-requirements-document editor.",
    "Help the user think through, draft, and refine the current PRD. Be concise, concrete, and practical.",
    "Format answers in Markdown. When proposing PRD content, use clear headings and bullet points.",
    "Work only from the document and the conversation; if you're unsure, say so rather than inventing facts.",
    "",
    `The user is viewing a PRD titled "${title}". Its current content is below:`,
    "<document>",
    doc,
    "</document>",
  ].join("\n");
}
