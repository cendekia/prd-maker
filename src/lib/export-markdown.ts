/**
 * Render a TipTap/ProseMirror JSON document to a Markdown string.
 *
 * Hand-rolled to mirror `renderPageHtml`. Going through prosemirror-markdown
 * would force us to instantiate the editor schema server-side; this avoids
 * the dep and keeps the export path framework-free.
 *
 * Marks intentionally stripped: `comment` (private collab metadata).
 */

type Mark = {
  type: string;
  attrs?: Record<string, unknown>;
};

type Node = {
  type: string;
  attrs?: Record<string, unknown>;
  marks?: Mark[];
  text?: string;
  content?: Node[];
};

interface Ctx {
  /** Markdown list nesting prefix ("  ", "    ", …). */
  indent: string;
  /** When inside an ordered list, the running 1-based counter at the
   *  current depth. Empty string means "we're in a bullet list". */
  olCounter: number | null;
}

const DEFAULT_CTX: Ctx = { indent: "", olCounter: null };

export function renderPageMarkdown(doc: unknown, title?: string): string {
  if (!doc || typeof doc !== "object") return title ? `# ${title}\n` : "";
  const root = doc as Node;
  const head = title ? `# ${escapeText(title)}\n\n` : "";
  if (root.type === "doc" && Array.isArray(root.content)) {
    const body = root.content
      .map((n) => renderBlock(n, DEFAULT_CTX))
      .filter(Boolean)
      .join("\n\n");
    return head + body + "\n";
  }
  return head + renderBlock(root, DEFAULT_CTX) + "\n";
}

function renderBlock(node: Node, ctx: Ctx): string {
  if (!node) return "";
  switch (node.type) {
    case "paragraph":
      return renderInline(node);

    case "heading": {
      const level = clampHeading(node.attrs?.level);
      return `${"#".repeat(level)} ${renderInline(node)}`;
    }

    case "blockquote":
      return prefixLines(renderBlocks(node, ctx), "> ");

    case "bulletList":
      return renderList(node, { ...ctx, olCounter: null });

    case "orderedList": {
      const start =
        typeof node.attrs?.start === "number"
          ? (node.attrs.start as number)
          : 1;
      return renderList(node, { ...ctx, olCounter: start });
    }

    case "listItem":
      // Handled inside renderList — never reached at the top level.
      return renderBlocks(node, ctx);

    case "taskList":
      return renderTaskList(node, ctx);

    case "taskItem":
      return renderBlocks(node, ctx);

    case "codeBlock": {
      const lang = stringAttr(node.attrs?.language);
      const text = (node.content ?? []).map((c) => c.text ?? "").join("");
      return "```" + lang + "\n" + text + "\n```";
    }

    case "horizontalRule":
      return "---";

    case "image": {
      const src = sanitizeUrl(node.attrs?.src);
      if (!src) return "";
      const alt = stringAttr(node.attrs?.alt);
      const title = stringAttr(node.attrs?.title);
      const titlePart = title ? ` "${escapeText(title)}"` : "";
      return `![${escapeText(alt)}](${src}${titlePart})`;
    }

    case "table":
      return renderTable(node);

    case "embed": {
      // No iframes in Markdown — emit a labelled link to the source.
      const url = sanitizeUrl(node.attrs?.url);
      if (!url) return "";
      const title =
        stringAttr(node.attrs?.title) ||
        stringAttr(node.attrs?.providerLabel) ||
        url;
      return `[${escapeText(title)}](${url})`;
    }

    default:
      // Fallback: stringify any inline content we recognise.
      return renderInline(node);
  }
}

function renderBlocks(node: Node, ctx: Ctx): string {
  if (!Array.isArray(node.content)) return "";
  return node.content
    .map((c) => renderBlock(c, ctx))
    .filter(Boolean)
    .join("\n\n");
}

function renderList(node: Node, ctx: Ctx): string {
  const items = (node.content ?? []).filter((c) => c.type === "listItem");
  let counter = ctx.olCounter ?? 1;
  const childIndent = ctx.indent + "  ";
  return items
    .map((item) => {
      const marker = ctx.olCounter !== null ? `${counter++}.` : "-";
      const body = renderBlocks(item, { ...ctx, indent: childIndent });
      return formatItem(marker, body, ctx.indent);
    })
    .join("\n");
}

function renderTaskList(node: Node, ctx: Ctx): string {
  const items = (node.content ?? []).filter((c) => c.type === "taskItem");
  const childIndent = ctx.indent + "  ";
  return items
    .map((item) => {
      const checked = item.attrs?.checked === true;
      const marker = `- [${checked ? "x" : " "}]`;
      const body = renderBlocks(item, { ...ctx, indent: childIndent });
      return formatItem(marker, body, ctx.indent);
    })
    .join("\n");
}

function formatItem(marker: string, body: string, indent: string): string {
  const [first, ...rest] = body.split("\n");
  const head = `${indent}${marker} ${first}`;
  if (rest.length === 0) return head;
  const tail = rest.map((l) => (l ? `${indent}  ${l}` : "")).join("\n");
  return `${head}\n${tail}`;
}

function renderTable(node: Node): string {
  const rows = (node.content ?? []).filter((c) => c.type === "tableRow");
  if (rows.length === 0) return "";
  const cellText = (cell: Node) =>
    renderInline(cell).replace(/\n+/g, " ").replace(/\|/g, "\\|");
  const head = rows[0].content ?? [];
  const headLine = `| ${head.map(cellText).join(" | ")} |`;
  const sepLine = `| ${head.map(() => "---").join(" | ")} |`;
  const bodyLines = rows.slice(1).map((r) => {
    const cells = (r.content ?? []).map(cellText);
    return `| ${cells.join(" | ")} |`;
  });
  return [headLine, sepLine, ...bodyLines].join("\n");
}

function renderInline(node: Node): string {
  if (!Array.isArray(node.content)) return "";
  return node.content.map(renderInlineChild).join("");
}

function renderInlineChild(node: Node): string {
  if (!node) return "";
  if (node.type === "text") {
    return wrapMarks(escapeText(node.text ?? ""), node.marks);
  }
  if (node.type === "hardBreak") return "  \n";
  if (node.type === "pageLink") {
    const label =
      stringAttr(node.attrs?.label) || stringAttr(node.attrs?.title);
    return label ? `**${escapeText(label)}**` : "";
  }
  if (node.type === "mention") {
    const label = stringAttr(node.attrs?.label);
    return label ? `@${escapeText(label)}` : "";
  }
  if (node.type === "image") {
    return renderBlock(node, DEFAULT_CTX);
  }
  return renderInline(node);
}

function wrapMarks(text: string, marks: Mark[] | undefined): string {
  if (!marks || marks.length === 0) return text;
  let out = text;
  for (const m of marks) {
    switch (m.type) {
      case "bold":
      case "strong":
        out = `**${out}**`;
        break;
      case "italic":
      case "em":
        out = `*${out}*`;
        break;
      case "strike":
        out = `~~${out}~~`;
        break;
      case "code":
        out = `\`${out}\``;
        break;
      case "link": {
        const href = sanitizeUrl(m.attrs?.href);
        if (!href) break;
        out = `[${out}](${href})`;
        break;
      }
      default:
        // Unknown / private marks (e.g. comment) — pass content through.
        break;
    }
  }
  return out;
}

function prefixLines(text: string, prefix: string): string {
  if (!text) return prefix.trimEnd();
  return text
    .split("\n")
    .map((l) => (l ? `${prefix}${l}` : prefix.trimEnd()))
    .join("\n");
}

function clampHeading(level: unknown): number {
  const n = typeof level === "number" ? level : 1;
  if (n < 1) return 1;
  if (n > 6) return 6;
  return n;
}

function stringAttr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function escapeText(s: string): string {
  // Conservative: only escape characters that would create unintended Markdown
  // structure. Aggressively escaping every special char makes output noisy.
  return s.replace(/([\\`*_{}[\]()#+!~|])/g, "\\$1");
}

function sanitizeUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (trimmed.length === 0) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^mailto:/i.test(trimmed)) return trimmed;
  if (/^data:image\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/") || trimmed.startsWith("#")) return trimmed;
  return "";
}
