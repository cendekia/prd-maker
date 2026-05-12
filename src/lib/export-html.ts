import { renderPageHtml } from "@/lib/render-page";

/**
 * Wrap the body fragment produced by `renderPageHtml` in a complete,
 * standalone HTML document for download. Styling here intentionally
 * mirrors the public publish surface (`/p/[slug]`) so what authors see
 * online matches what readers see in the file.
 */
export function exportPageHtml(args: { title: string; doc: unknown }): string {
  const body = renderPageHtml(args.doc);
  const safeTitle = escape(args.title);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<style>${PROSE_CSS}</style>
</head>
<body>
<article class="prdmaker-doc">
<h1>${safeTitle}</h1>
${body}
</article>
</body>
</html>
`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const PROSE_CSS = `
:root {
  color-scheme: light;
  --fg: #111;
  --fg-2: #555;
  --muted: #f4f4f5;
  --border: #e5e5e5;
  --link: #2563eb;
}
* { box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 16px;
  line-height: 1.7;
  color: var(--fg);
  margin: 0;
  background: #fff;
}
.prdmaker-doc {
  max-width: 760px;
  margin: 0 auto;
  padding: 56px 24px;
}
.prdmaker-doc > * + * { margin-top: 1em; }
.prdmaker-doc h1, .prdmaker-doc h2, .prdmaker-doc h3 {
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.25;
}
.prdmaker-doc h1 { font-size: 32px; }
.prdmaker-doc h2 { font-size: 22px; margin-top: 1.4em; }
.prdmaker-doc h3 { font-size: 18px; margin-top: 1.2em; }
.prdmaker-doc a { color: var(--link); text-underline-offset: 2px; }
.prdmaker-doc ul, .prdmaker-doc ol { padding-left: 1.4em; }
.prdmaker-doc li + li { margin-top: 0.25em; }
.prdmaker-doc blockquote {
  border-left: 3px solid var(--border);
  padding-left: 1em;
  color: var(--fg-2);
  font-style: italic;
}
.prdmaker-doc code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.92em;
  background: var(--muted);
  padding: 0.1em 0.35em;
  border-radius: 4px;
}
.prdmaker-doc pre {
  background: var(--muted);
  border-radius: 8px;
  padding: 14px 16px;
  overflow-x: auto;
  font-size: 13px;
}
.prdmaker-doc pre code { background: transparent; padding: 0; }
.prdmaker-doc hr { border: 0; border-top: 1px solid var(--border); margin: 2em 0; }
.prdmaker-doc img { max-width: 100%; height: auto; border-radius: 6px; }
.prdmaker-doc table { width: 100%; border-collapse: collapse; font-size: 14px; }
.prdmaker-doc th, .prdmaker-doc td {
  border: 1px solid var(--border);
  padding: 8px 10px;
  text-align: left;
  vertical-align: top;
}
.prdmaker-doc th { background: var(--muted); font-weight: 600; }
.prdmaker-doc ul.task-list { list-style: none; padding-left: 0; }
.prdmaker-doc li.task-item { display: flex; gap: 0.5em; }
`;
