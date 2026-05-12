import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from "@react-pdf/renderer";
import type { ReactNode } from "react";

/**
 * Render a TipTap JSON document to a PDF Buffer using @react-pdf/renderer.
 *
 * @react-pdf has its own JSX primitives (Document/Page/View/Text) — no HTML.
 * We walk the JSON tree and map each node type to the closest visual
 * equivalent in those primitives. Inline marks combine into a single `Text`
 * style object since @react-pdf doesn't nest inline styling the way HTML does.
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

const styles = StyleSheet.create({
  page: {
    paddingTop: 56,
    paddingBottom: 56,
    paddingHorizontal: 64,
    fontSize: 11,
    lineHeight: 1.55,
    color: "#111",
    fontFamily: "Helvetica",
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    marginBottom: 16,
  },
  meta: {
    fontSize: 9,
    color: "#666",
    marginBottom: 24,
  },
  paragraph: { marginBottom: 8 },
  h1: { fontSize: 18, fontWeight: 700, marginTop: 16, marginBottom: 8 },
  h2: { fontSize: 15, fontWeight: 700, marginTop: 14, marginBottom: 6 },
  h3: { fontSize: 13, fontWeight: 700, marginTop: 12, marginBottom: 4 },
  blockquote: {
    borderLeftWidth: 2,
    borderLeftColor: "#d4d4d8",
    paddingLeft: 10,
    color: "#52525b",
    fontStyle: "italic",
    marginBottom: 8,
  },
  listItem: { flexDirection: "row", marginBottom: 2 },
  listBullet: { width: 14 },
  codeBlock: {
    backgroundColor: "#f4f4f5",
    padding: 10,
    borderRadius: 4,
    fontFamily: "Courier",
    fontSize: 10,
    marginBottom: 8,
  },
  hr: {
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
    marginVertical: 14,
  },
  table: {
    borderWidth: 1,
    borderColor: "#e5e5e5",
    marginBottom: 8,
  },
  tableRow: { flexDirection: "row" },
  tableCell: {
    flex: 1,
    padding: 6,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#e5e5e5",
    fontSize: 10,
  },
  tableHeader: { backgroundColor: "#f4f4f5", fontWeight: 700 },
  inlineCode: { fontFamily: "Courier", fontSize: 10 },
  link: { color: "#2563eb", textDecoration: "underline" },
  bold: { fontWeight: 700 },
  italic: { fontStyle: "italic" },
  strike: { textDecoration: "line-through" },
  image: { marginVertical: 8, maxWidth: "100%" },
  imageCaption: { fontSize: 9, color: "#666", marginBottom: 4 },
});

export async function exportPagePdf(args: {
  title: string;
  doc: unknown;
  updatedAt: Date;
}): Promise<Buffer> {
  const instance = pdf(
    <PageDocument
      title={args.title}
      doc={args.doc}
      updatedAt={args.updatedAt}
    />,
  );
  const blob = await instance.toBlob();
  const arr = await blob.arrayBuffer();
  return Buffer.from(arr);
}

function PageDocument({
  title,
  doc,
  updatedAt,
}: {
  title: string;
  doc: unknown;
  updatedAt: Date;
}) {
  const root = (doc as Node | null) ?? null;
  const blocks =
    root && root.type === "doc" && Array.isArray(root.content)
      ? root.content
      : [];
  return (
    <Document title={title}>
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.meta}>
          Last updated{" "}
          {updatedAt.toLocaleDateString([], {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </Text>
        {blocks.map((n, i) => (
          <Block key={i} node={n} />
        ))}
      </Page>
    </Document>
  );
}

function Block({ node }: { node: Node }): ReactNode {
  if (!node) return null;
  switch (node.type) {
    case "paragraph":
      return <Text style={styles.paragraph}>{renderInline(node)}</Text>;
    case "heading": {
      const level = clampHeading(node.attrs?.level);
      const style =
        level === 1 ? styles.h1 : level === 2 ? styles.h2 : styles.h3;
      return <Text style={style}>{renderInline(node)}</Text>;
    }
    case "blockquote":
      return <View style={styles.blockquote}>{renderBlocks(node)}</View>;
    case "bulletList":
      return <View>{renderList(node, null)}</View>;
    case "orderedList": {
      const start =
        typeof node.attrs?.start === "number"
          ? (node.attrs.start as number)
          : 1;
      return <View>{renderList(node, start)}</View>;
    }
    case "taskList":
      return <View>{renderTaskList(node)}</View>;
    case "codeBlock": {
      const text = (node.content ?? []).map((c) => c.text ?? "").join("");
      return <Text style={styles.codeBlock}>{text || " "}</Text>;
    }
    case "horizontalRule":
      return <View style={styles.hr} />;
    case "image": {
      const src = sanitizeImageSrc(node.attrs?.src);
      if (!src) return null;
      const alt = stringAttr(node.attrs?.alt);
      return (
        <View wrap={false}>
          <Image src={src} style={styles.image} />
          {alt ? <Text style={styles.imageCaption}>{alt}</Text> : null}
        </View>
      );
    }
    case "table":
      return <View style={styles.table}>{renderTableRows(node)}</View>;
    default:
      // Anything we don't recognise — show its inline projection so we don't
      // silently lose user content.
      return <Text style={styles.paragraph}>{renderInline(node)}</Text>;
  }
}

function renderBlocks(node: Node): ReactNode {
  if (!Array.isArray(node.content)) return null;
  return node.content.map((c, i) => <Block key={i} node={c} />);
}

function renderList(node: Node, start: number | null): ReactNode {
  const items = (node.content ?? []).filter((c) => c.type === "listItem");
  let counter = start ?? 1;
  return items.map((item, i) => {
    const marker = start !== null ? `${counter++}.` : "•";
    return (
      <View key={i} style={styles.listItem}>
        <Text style={styles.listBullet}>{marker}</Text>
        <View style={{ flex: 1 }}>{renderBlocks(item)}</View>
      </View>
    );
  });
}

function renderTaskList(node: Node): ReactNode {
  const items = (node.content ?? []).filter((c) => c.type === "taskItem");
  return items.map((item, i) => {
    const checked = item.attrs?.checked === true;
    return (
      <View key={i} style={styles.listItem}>
        <Text style={styles.listBullet}>{checked ? "☑" : "☐"}</Text>
        <View style={{ flex: 1 }}>{renderBlocks(item)}</View>
      </View>
    );
  });
}

function renderTableRows(node: Node): ReactNode {
  const rows = (node.content ?? []).filter((c) => c.type === "tableRow");
  return rows.map((row, ri) => {
    const cells = row.content ?? [];
    const isHeader = cells.every((c) => c.type === "tableHeader");
    return (
      <View key={ri} style={styles.tableRow}>
        {cells.map((cell, ci) => (
          <Text
            key={ci}
            style={
              isHeader ? [styles.tableCell, styles.tableHeader] : styles.tableCell
            }
          >
            {renderInline(cell)}
          </Text>
        ))}
      </View>
    );
  });
}

function renderInline(node: Node): ReactNode {
  if (!Array.isArray(node.content)) return null;
  return node.content.map((c, i) => (
    <InlineNode key={i} node={c} />
  ));
}

function InlineNode({ node }: { node: Node }): ReactNode {
  if (!node) return null;
  if (node.type === "text") {
    const style = marksToStyle(node.marks);
    return <Text style={style}>{node.text ?? ""}</Text>;
  }
  if (node.type === "hardBreak") return <Text>{"\n"}</Text>;
  if (node.type === "pageLink") {
    const label =
      stringAttr(node.attrs?.label) || stringAttr(node.attrs?.title);
    return <Text style={styles.bold}>{label}</Text>;
  }
  if (node.type === "mention") {
    const label = stringAttr(node.attrs?.label);
    return <Text style={styles.bold}>@{label}</Text>;
  }
  if (node.type === "image") {
    // Inline-position image (rare — TipTap configures images as block) —
    // fall back to a small caption rather than nesting <Image> inside <Text>,
    // which @react-pdf doesn't support.
    const alt = stringAttr(node.attrs?.alt);
    return <Text style={styles.italic}>[image{alt ? `: ${alt}` : ""}]</Text>;
  }
  // Inline-but-unknown — recurse so we don't drop child text.
  return <>{renderInline(node)}</>;
}

function marksToStyle(marks: Mark[] | undefined) {
  if (!marks || marks.length === 0) return undefined;
  const stack: Record<string, unknown>[] = [];
  for (const mark of marks) {
    switch (mark.type) {
      case "bold":
      case "strong":
        stack.push(styles.bold);
        break;
      case "italic":
      case "em":
        stack.push(styles.italic);
        break;
      case "strike":
        stack.push(styles.strike);
        break;
      case "code":
        stack.push(styles.inlineCode);
        break;
      case "link":
        stack.push(styles.link);
        break;
      default:
        // comment + unknowns — drop the styling, keep the text.
        break;
    }
  }
  return stack.length === 0 ? undefined : Object.assign({}, ...stack);
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

/**
 * @react-pdf supports data URLs and http(s) URLs out of the box. Reject any
 * other scheme (file:, javascript:, etc.) so a malformed editor doc can't
 * point the renderer at the local filesystem.
 */
function sanitizeImageSrc(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^data:image\//i.test(trimmed)) return trimmed;
  return null;
}
