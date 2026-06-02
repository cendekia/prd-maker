import { Fragment, type CSSProperties, type JSX, type ReactNode } from "react";

import { isAllowedEmbedHost } from "@/lib/embeds/match";

/**
 * Server-rendered React tree for the public publish surface.
 *
 * We render the TipTap JSON straight into JSX so React's text-escaping does
 * the heavy lifting. URL attributes still go through a whitelist below since
 * React won't drop `href="javascript:..."` on its own.
 *
 * Marks intentionally stripped on the public surface:
 *  - `comment`  — collab metadata, leaks reviewer notes
 *  - unknown marks/nodes — fail closed; their children still render so
 *    we never silently drop user content.
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

export function PublicDoc({ doc }: { doc: unknown }) {
  if (!doc || typeof doc !== "object") return null;
  const root = doc as Node;
  if (root.type === "doc" && Array.isArray(root.content)) {
    return (
      <>
        {root.content.map((child, i) => (
          <Fragment key={i}>{renderNode(child, `n-${i}`)}</Fragment>
        ))}
      </>
    );
  }
  return <>{renderNode(root, "n-0")}</>;
}

function renderNode(node: Node, key: string): ReactNode {
  if (!node) return null;
  switch (node.type) {
    case "text":
      return wrapMarks(node.text ?? "", node.marks, key);

    case "paragraph":
      return <p key={key}>{renderChildren(node, key)}</p>;

    case "heading": {
      const level = clampHeading(node.attrs?.level);
      const Tag = `h${level}` as keyof JSX.IntrinsicElements;
      return <Tag key={key}>{renderChildren(node, key)}</Tag>;
    }

    case "blockquote":
      return <blockquote key={key}>{renderChildren(node, key)}</blockquote>;

    case "bulletList":
      return <ul key={key}>{renderChildren(node, key)}</ul>;

    case "orderedList": {
      const start =
        typeof node.attrs?.start === "number" ? (node.attrs.start as number) : undefined;
      return (
        <ol key={key} start={start}>
          {renderChildren(node, key)}
        </ol>
      );
    }

    case "listItem":
      return <li key={key}>{renderChildren(node, key)}</li>;

    case "taskList":
      return (
        <ul key={key} className="task-list">
          {renderChildren(node, key)}
        </ul>
      );

    case "taskItem": {
      const checked = node.attrs?.checked === true;
      return (
        <li key={key} className="task-item" data-checked={checked}>
          <input type="checkbox" disabled checked={checked} readOnly />
          <span> {renderChildren(node, key)}</span>
        </li>
      );
    }

    case "codeBlock": {
      const language = stringAttr(node.attrs?.language);
      const text = (node.content ?? []).map((c) => c.text ?? "").join("");
      return (
        <pre key={key}>
          <code className={language ? `language-${language}` : undefined}>
            {text}
          </code>
        </pre>
      );
    }

    case "horizontalRule":
      return <hr key={key} />;

    case "hardBreak":
      return <br key={key} />;

    case "image": {
      const src = sanitizeUrl(node.attrs?.src);
      if (!src) return null;
      const alt = stringAttr(node.attrs?.alt);
      const title = stringAttr(node.attrs?.title);
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={key}
          src={src}
          alt={alt}
          title={title || undefined}
          loading="lazy"
        />
      );
    }

    case "table":
      return (
        <table key={key}>
          <tbody>{renderChildren(node, key)}</tbody>
        </table>
      );
    case "tableRow":
      return <tr key={key}>{renderChildren(node, key)}</tr>;
    case "tableHeader":
      return <th key={key}>{renderChildren(node, key)}</th>;
    case "tableCell":
      return <td key={key}>{renderChildren(node, key)}</td>;

    case "pageLink": {
      // Authed app shows a chip linking to another workspace page; for the
      // public surface we render the label as bold text rather than leak
      // an internal URL anonymous readers can't access.
      const label = stringAttr(node.attrs?.label) || stringAttr(node.attrs?.title);
      if (!label) return null;
      return <strong key={key}>{label}</strong>;
    }

    case "mention": {
      const label = stringAttr(node.attrs?.label);
      if (!label) return null;
      return (
        <span key={key} className="mention">
          @{label}
        </span>
      );
    }

    case "embed":
      return renderEmbed(node, key);

    default:
      // Unknown node — render children so we don't silently lose content.
      return <Fragment key={key}>{renderChildren(node, key)}</Fragment>;
  }
}

function renderChildren(node: Node, parentKey: string): ReactNode {
  if (!Array.isArray(node.content)) return null;
  return node.content.map((child, i) => (
    <Fragment key={`${parentKey}.${i}`}>
      {renderNode(child, `${parentKey}.${i}`)}
    </Fragment>
  ));
}

const EMBED_IFRAME_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
const EMBED_IFRAME_SANDBOX =
  "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation";

/**
 * Render an embed on the public surface. `embedUrl` is re-validated against the
 * iframe host allowlist — we never iframe an arbitrary stored URL — so a
 * tampered embed degrades to a plain link card.
 */
function renderEmbed(node: Node, key: string): ReactNode {
  const url = sanitizeUrl(node.attrs?.url);
  const embedUrl = stringAttr(node.attrs?.embedUrl);
  const kind = stringAttr(node.attrs?.kind);
  const title = stringAttr(node.attrs?.title) || hostnameOf(url) || "Embed";
  const providerLabel =
    stringAttr(node.attrs?.providerLabel) || hostnameOf(url) || "Link";

  if (kind !== "link" && isAllowedEmbedHost(embedUrl)) {
    const fixedHeight = numAttr(node.attrs?.fixedHeight);
    const ratio = numAttr(node.attrs?.aspectRatio) || 16 / 9;
    const bodyStyle: CSSProperties =
      fixedHeight && fixedHeight > 0
        ? { height: fixedHeight }
        : { aspectRatio: String(ratio) };
    return (
      <div key={key} className="embed embed--frame">
        <div className="embed-bar">
          <span className="embed-bar-label">{providerLabel}</span>
          {url ? (
            <a
              className="embed-bar-link"
              href={url}
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              Open ↗
            </a>
          ) : null}
        </div>
        <div className="embed-frame-body" style={bodyStyle}>
          <iframe
            src={embedUrl}
            title={title}
            loading="lazy"
            allow={EMBED_IFRAME_ALLOW}
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox={EMBED_IFRAME_SANDBOX}
          />
        </div>
      </div>
    );
  }

  if (!url) return null;
  return (
    <a
      key={key}
      className="embed embed--card"
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
    >
      <span className="embed-card-text">
        <span className="embed-card-title">{title}</span>
        <span className="embed-card-url">{url}</span>
      </span>
      <span className="embed-card-badge">{providerLabel}</span>
    </a>
  );
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

function wrapMarks(
  text: string,
  marks: Mark[] | undefined,
  key: string,
): ReactNode {
  if (!text) return null;
  if (!marks || marks.length === 0) return text;

  let node: ReactNode = text;
  for (let i = marks.length - 1; i >= 0; i--) {
    const mark = marks[i];
    const k = `${key}.m${i}`;
    switch (mark.type) {
      case "bold":
      case "strong":
        node = <strong key={k}>{node}</strong>;
        break;
      case "italic":
      case "em":
        node = <em key={k}>{node}</em>;
        break;
      case "strike":
        node = <s key={k}>{node}</s>;
        break;
      case "underline":
        node = <u key={k}>{node}</u>;
        break;
      case "code":
        node = <code key={k}>{node}</code>;
        break;
      case "link": {
        const href = sanitizeUrl(mark.attrs?.href);
        if (!href) break;
        node = (
          <a
            key={k}
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
          >
            {node}
          </a>
        );
        break;
      }
      default:
        // Unknown/private marks (e.g. comment) — keep the underlying text.
        break;
    }
  }
  return node;
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
