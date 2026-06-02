/**
 * Extract a plain-text projection from a TipTap/ProseMirror JSON doc.
 *
 * Used server-side: we keep `Page.contentText` in sync on every write so
 * Step 22's full-text search can query it without parsing JSON. Block
 * boundaries are joined with newlines, inline children with spaces.
 */
type Node = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: Node[];
};

const BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
  "codeBlock",
  "horizontalRule",
  "table",
  "tableRow",
]);

export function extractText(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  const out: string[] = [];
  walk(doc as Node, out);
  return out
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function walk(node: Node, out: string[]) {
  if (!node) return;
  if (typeof node.text === "string") {
    out.push(node.text);
    return;
  }
  if (node.type === "embed") {
    // Atom node with no text children — surface its title + url so embedded
    // content is still discoverable via search / AI page context.
    const title = typeof node.attrs?.title === "string" ? node.attrs.title : "";
    const url = typeof node.attrs?.url === "string" ? node.attrs.url : "";
    const text = [title, url].filter(Boolean).join(" ");
    if (text) out.push(text);
    out.push("\n");
    return;
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) walk(child, out);
  }
  if (node.type && BLOCK_TYPES.has(node.type)) {
    out.push("\n");
  }
}
