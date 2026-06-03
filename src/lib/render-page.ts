/**
 * Render a TipTap/ProseMirror JSON document to a static HTML string.
 *
 * Used by the public publish surface (Step 23) and by HTML export (Step 30).
 * We hand-roll the renderer rather than spin up jsdom + @tiptap/html because:
 *   1. The public route is SSR'd on every request — keeping the renderer
 *      pure-string keeps cold-start fast.
 *   2. We need precise control over which marks/nodes appear publicly
 *      (CommentMark, for example, is stripped — comments are private).
 *
 * The output is a fragment of escaped HTML — the caller wraps it in a
 * styled prose container.
 */

import { isAllowedEmbedHost } from "@/lib/embeds/match";

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

export function renderPageHtml(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  const node = doc as Node;
  if (node.type === "doc" && Array.isArray(node.content)) {
    return node.content.map(renderNode).join("");
  }
  return renderNode(node);
}

function renderNode(node: Node): string {
  if (!node) return "";
  switch (node.type) {
    case "text":
      return wrapMarks(escapeHtml(node.text ?? ""), node.marks);

    case "paragraph":
      return `<p>${renderChildren(node)}</p>`;

    case "heading": {
      const level = clampHeading(node.attrs?.level);
      return `<h${level}>${renderChildren(node)}</h${level}>`;
    }

    case "blockquote":
      return `<blockquote>${renderChildren(node)}</blockquote>`;

    case "bulletList":
      return `<ul>${renderChildren(node)}</ul>`;

    case "orderedList": {
      const start = node.attrs?.start;
      const startAttr =
        typeof start === "number" && start !== 1
          ? ` start="${escapeAttr(String(start))}"`
          : "";
      return `<ol${startAttr}>${renderChildren(node)}</ol>`;
    }

    case "listItem":
      return `<li>${renderChildren(node)}</li>`;

    case "taskList":
      return `<ul class="task-list">${renderChildren(node)}</ul>`;

    case "taskItem": {
      const checked = node.attrs?.checked === true;
      return `<li class="task-item" data-checked="${checked}"><input type="checkbox" disabled${
        checked ? " checked" : ""
      }> ${renderChildren(node)}</li>`;
    }

    case "codeBlock": {
      const lang =
        typeof node.attrs?.language === "string"
          ? ` class="language-${escapeAttr(node.attrs.language as string)}"`
          : "";
      // Code blocks never wrap marks — only their text content.
      const text = (node.content ?? [])
        .map((c) => escapeHtml(c.text ?? ""))
        .join("");
      return `<pre><code${lang}>${text}</code></pre>`;
    }

    case "horizontalRule":
      return "<hr>";

    case "hardBreak":
      return "<br>";

    case "image": {
      const src = sanitizeUrl(node.attrs?.src);
      if (!src) return "";
      const alt = escapeAttr(stringAttr(node.attrs?.alt));
      const title = stringAttr(node.attrs?.title);
      const titleAttr = title ? ` title="${escapeAttr(title)}"` : "";
      return `<img src="${escapeAttr(src)}" alt="${alt}"${titleAttr} loading="lazy">`;
    }

    case "table":
      return `<table>${renderChildren(node)}</table>`;
    case "tableRow":
      return `<tr>${renderChildren(node)}</tr>`;
    case "tableHeader":
      return `<th>${renderChildren(node)}</th>`;
    case "tableCell":
      return `<td>${renderChildren(node)}</td>`;

    case "pageLink": {
      // In the authed app this is a chip linking elsewhere in the workspace,
      // but on the public surface we render the label as plain bold text so
      // anonymous readers don't see workspace-internal links.
      const label = stringAttr(node.attrs?.label) || stringAttr(node.attrs?.title);
      if (!label) return "";
      return `<strong>${escapeHtml(label)}</strong>`;
    }

    case "mention": {
      const label = stringAttr(node.attrs?.label);
      if (!label) return "";
      return `<span class="mention">@${escapeHtml(label)}</span>`;
    }

    case "embed":
      return renderEmbed(node);

    case "epicBlock":
      return renderEpicBlock(node);

    default:
      // Unknown node — render its children so we never silently drop content.
      return renderChildren(node);
  }
}

function renderChildren(node: Node): string {
  if (!Array.isArray(node.content)) return "";
  return node.content.map(renderNode).join("");
}

const EMBED_IFRAME_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
const EMBED_IFRAME_SANDBOX =
  "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation";

/**
 * Render an embed node. `embedUrl` is re-validated against the iframe host
 * allowlist here too — never trust stored `contentJson` on the public surface —
 * so a tampered embed degrades to a plain link card instead of an arbitrary
 * iframe.
 */
function renderEmbed(node: Node): string {
  const url = sanitizeUrl(node.attrs?.url);
  const embedUrl = stringAttr(node.attrs?.embedUrl);
  const kind = stringAttr(node.attrs?.kind);
  const title = stringAttr(node.attrs?.title) || hostnameOf(url) || "Embed";
  const providerLabel =
    stringAttr(node.attrs?.providerLabel) || hostnameOf(url) || "Link";

  if (kind !== "link" && isAllowedEmbedHost(embedUrl)) {
    const fixedHeight = numAttr(node.attrs?.fixedHeight);
    const ratio = numAttr(node.attrs?.aspectRatio) || 16 / 9;
    const style =
      fixedHeight && fixedHeight > 0
        ? `height:${fixedHeight}px`
        : `aspect-ratio:${ratio}`;
    const openLink = url
      ? `<a class="embed-bar-link" href="${escapeAttr(
          url,
        )}" target="_blank" rel="noopener noreferrer nofollow">Open ↗</a>`
      : "";
    return (
      `<div class="embed embed--frame">` +
      `<div class="embed-bar"><span class="embed-bar-label">${escapeHtml(
        providerLabel,
      )}</span>${openLink}</div>` +
      `<div class="embed-frame-body" style="${style}">` +
      `<iframe src="${escapeAttr(
        embedUrl,
      )}" title="${escapeAttr(title)}" loading="lazy" allow="${EMBED_IFRAME_ALLOW}" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" sandbox="${EMBED_IFRAME_SANDBOX}"></iframe>` +
      `</div></div>`
    );
  }

  // Link card — needs a safe http(s) target or we drop it.
  if (!url) return "";
  return (
    `<a class="embed embed--card" href="${escapeAttr(
      url,
    )}" target="_blank" rel="noopener noreferrer nofollow">` +
    `<span class="embed-card-text"><span class="embed-card-title">${escapeHtml(
      title,
    )}</span><span class="embed-card-url">${escapeHtml(url)}</span></span>` +
    `<span class="embed-card-badge">${escapeHtml(providerLabel)}</span>` +
    `</a>`
  );
}

/**
 * Epic block (Step 43) → plain prose: a heading, optional summary, and a list
 * of user stories. Rendered with standard elements so it inherits the public /
 * export prose styles without bespoke CSS.
 */
function renderEpicBlock(node: Node): string {
  const title = stringAttr(node.attrs?.title) || "Untitled epic";
  const summary = stringAttr(node.attrs?.summary);
  const stories = Array.isArray(node.attrs?.stories)
    ? (node.attrs?.stories as Record<string, unknown>[])
    : [];

  let out = `<h3>${escapeHtml(`Epic: ${title}`)}</h3>`;
  if (summary) out += `<p>${escapeHtml(summary)}</p>`;
  if (stories.length > 0) {
    out += "<ul>";
    for (const s of stories) {
      const t = stringAttr(s.title) || "Untitled story";
      const status = stringAttr(s.status);
      const pts = numAttr(s.points);
      const meta = [
        status ? humanizeStatus(status) : "",
        pts != null ? `${pts} pts` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      let li = `<strong>${escapeHtml(t)}</strong>`;
      if (meta) li += ` <em>(${escapeHtml(meta)})</em>`;
      const asA = stringAttr(s.asA);
      const iWant = stringAttr(s.iWant);
      const soThat = stringAttr(s.soThat);
      if (asA || iWant || soThat) {
        li += `<br>${escapeHtml(
          `As a ${asA || "…"}, I want ${iWant || "…"}, so that ${soThat || "…"}.`,
        )}`;
      }
      const acc = stringAttr(s.acceptance);
      if (acc) li += `<br>Acceptance: ${escapeHtml(acc)}`;
      out += `<li>${li}</li>`;
    }
    out += "</ul>";
  }
  return out;
}

function humanizeStatus(s: string): string {
  const lower = s.toLowerCase().replace(/_/g, " ");
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function numAttr(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function hostnameOf(value: string): string {
  try {
    return new URL(value).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Wrap inline text in the supplied marks. We intentionally strip:
 *   - `comment` — private collab metadata
 *   - any unknown mark — fail closed rather than emit untrusted HTML
 */
function wrapMarks(content: string, marks: Mark[] | undefined): string {
  if (!marks || marks.length === 0) return content;
  let out = content;
  for (const mark of marks) {
    switch (mark.type) {
      case "bold":
      case "strong":
        out = `<strong>${out}</strong>`;
        break;
      case "italic":
      case "em":
        out = `<em>${out}</em>`;
        break;
      case "strike":
        out = `<s>${out}</s>`;
        break;
      case "underline":
        out = `<u>${out}</u>`;
        break;
      case "code":
        out = `<code>${out}</code>`;
        break;
      case "link": {
        const href = sanitizeUrl(mark.attrs?.href);
        if (!href) break;
        const target = stringAttr(mark.attrs?.target) || "_blank";
        out = `<a href="${escapeAttr(href)}" target="${escapeAttr(
          target,
        )}" rel="noopener noreferrer nofollow">${out}</a>`;
        break;
      }
      default:
        // Unknown marks (e.g. comment) are dropped — content survives.
        break;
    }
  }
  return out;
}

function clampHeading(level: unknown): 1 | 2 | 3 {
  const n = typeof level === "number" ? level : 1;
  if (n <= 1) return 1;
  if (n >= 3) return 3;
  return 2;
}

function stringAttr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

/**
 * Allow only http(s), mailto, and data:image URLs. Anything else (javascript:,
 * vbscript:, file:, etc.) returns the empty string so the caller drops the
 * element entirely — defense in depth against malicious editor JSON.
 */
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
