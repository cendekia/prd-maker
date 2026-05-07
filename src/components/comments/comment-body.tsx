"use client";

import { Fragment } from "react";

const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;

/**
 * Render a comment body — splits on `@[name](userId)` markers and renders
 * each as a styled chip. Plain text outside markers is rendered as-is with
 * line breaks preserved.
 */
export function CommentBody({ body }: { body: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of body.matchAll(MENTION_RE)) {
    const start = m.index ?? 0;
    if (start > last) {
      parts.push(
        <Fragment key={key++}>{renderText(body.slice(last, start))}</Fragment>,
      );
    }
    parts.push(
      <span
        key={key++}
        data-user-id={m[2]}
        className="mention-chip"
      >
        @{m[1]}
      </span>,
    );
    last = start + m[0].length;
  }
  if (last < body.length) {
    parts.push(<Fragment key={key++}>{renderText(body.slice(last))}</Fragment>);
  }
  return <>{parts}</>;
}

function renderText(text: string): React.ReactNode {
  // Preserve newlines as <br>.
  const lines = text.split("\n");
  return lines.map((line, i) => (
    <Fragment key={i}>
      {line}
      {i < lines.length - 1 ? <br /> : null}
    </Fragment>
  ));
}
