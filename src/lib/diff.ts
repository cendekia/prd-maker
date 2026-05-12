import { extractText } from "@/lib/editor-text";

export type DiffOp = "equal" | "insert" | "delete";

export interface DiffLine {
  op: DiffOp;
  text: string;
}

/**
 * Compute a line-level diff between two editor JSON snapshots.
 *
 * We project each doc to plain text via `extractText` (the same projection
 * used for search), split into lines, and run Hunt–Szymanski LCS to produce
 * a side-by-side script of additions and deletions. This is intentionally
 * simpler than a full ProseMirror-aware diff: it's robust to schema drift
 * across snapshots and renders cleanly as a two-column red/green view.
 */
export function diffDocs(left: unknown, right: unknown): {
  left: DiffLine[];
  right: DiffLine[];
} {
  const a = splitLines(extractText(left));
  const b = splitLines(extractText(right));
  const script = lcsDiff(a, b);
  const leftCol: DiffLine[] = [];
  const rightCol: DiffLine[] = [];
  for (const op of script) {
    switch (op.op) {
      case "equal":
        leftCol.push({ op: "equal", text: op.text });
        rightCol.push({ op: "equal", text: op.text });
        break;
      case "delete":
        leftCol.push({ op: "delete", text: op.text });
        rightCol.push({ op: "equal", text: "" });
        break;
      case "insert":
        leftCol.push({ op: "equal", text: "" });
        rightCol.push({ op: "insert", text: op.text });
        break;
    }
  }
  return { left: leftCol, right: rightCol };
}

function splitLines(text: string): string[] {
  if (!text) return [];
  return text.split(/\r?\n/);
}

interface ScriptOp {
  op: DiffOp;
  text: string;
}

/**
 * Classic O(n*m) LCS table walk. Inputs here are at most a few hundred
 * lines (a single page snapshot) so the quadratic table is fine.
 */
function lcsDiff(a: string[], b: string[]): ScriptOp[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }
  const out: ScriptOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: "equal", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ op: "delete", text: a[i] });
      i++;
    } else {
      out.push({ op: "insert", text: b[j] });
      j++;
    }
  }
  while (i < n) out.push({ op: "delete", text: a[i++] });
  while (j < m) out.push({ op: "insert", text: b[j++] });
  return out;
}
