import "server-only";

import { FeatureStatus } from "@prisma/client";

import { db } from "@/lib/db";
import { listStacks } from "@/lib/agent/stacks";
import { STACK_TYPE_LABELS } from "@/lib/agent/types";

/**
 * Workspace context builder (ai_development_plan.md Step 47). Renders the
 * application map — stacks, their features, recent PRDs — as the grounding
 * block for every agent prompt (chat loop, extraction, impact). Char-budgeted
 * like src/lib/ai-context.ts: when the catalog outgrows the budget, each
 * stack's feature list is trimmed evenly and the model is told to use
 * `list_features` for the rest.
 *
 * Ids are included on purpose: tools (`get_feature`, `propose_link`, …) take
 * catalog ids as arguments, so the map doubles as the agent's address book.
 */

export const DEFAULT_CONTEXT_BUDGET_CHARS = 12_000;

/** Unconfirmed (agent-suggested) features shown per stack before capping. */
const SUGGESTED_PER_STACK_CAP = 5;
/** Recent PRD titles appended after the catalog. */
const RECENT_PAGES_COUNT = 10;
/** Per-feature summary excerpt length inside the catalog. */
const SUMMARY_EXCERPT_CHARS = 160;

function excerpt(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

interface StackBlock {
  stackId: string;
  header: string;
  lines: string[];
  hiddenCount: number;
}

/**
 * Build the application-map context block for a workspace.
 * CONFIRMED/ACTIVE rows are canonical; SUGGESTED features are included
 * (capped) and labeled "unconfirmed" so the model treats them tentatively.
 */
export async function buildWorkspaceContext(
  workspaceId: string,
  budgetChars: number = DEFAULT_CONTEXT_BUDGET_CHARS,
): Promise<string> {
  const [workspace, stacks, features, linkCount, recentPages] =
    await Promise.all([
      db.workspace.findUnique({
        where: { id: workspaceId },
        select: { name: true },
      }),
      listStacks(workspaceId),
      db.feature.findMany({
        where: { workspaceId, archivedAt: null },
        orderBy: [{ status: "asc" }, { name: "asc" }],
        select: {
          id: true,
          stackId: true,
          name: true,
          summary: true,
          status: true,
        },
      }),
      db.featureLink.count({
        where: { workspaceId, status: { not: "REJECTED" } },
      }),
      db.page.findMany({
        where: { workspaceId, archivedAt: null },
        orderBy: { updatedAt: "desc" },
        take: RECENT_PAGES_COUNT,
        select: { id: true, title: true },
      }),
    ]);

  const blocks: StackBlock[] = stacks.map((stack) => {
    const own = features.filter((f) => f.stackId === stack.id);
    const canonical = own.filter((f) => f.status !== FeatureStatus.SUGGESTED);
    const suggested = own.filter((f) => f.status === FeatureStatus.SUGGESTED);
    const shownSuggested = suggested.slice(0, SUGGESTED_PER_STACK_CAP);

    const lines = [
      ...canonical.map((f) => {
        const status =
          f.status === FeatureStatus.DEPRECATED ? ", DEPRECATED" : "";
        return `- "${f.name}" (id ${f.id}${status}) — ${excerpt(f.summary, SUMMARY_EXCERPT_CHARS)}`;
      }),
      ...shownSuggested.map(
        (f) =>
          `- "${f.name}" (id ${f.id}, unconfirmed) — ${excerpt(f.summary, SUMMARY_EXCERPT_CHARS)}`,
      ),
    ];
    return {
      stackId: stack.id,
      header: `## ${stack.name} — ${STACK_TYPE_LABELS[stack.type]} (stack id ${stack.id}, ${own.length} feature${own.length === 1 ? "" : "s"})`,
      lines,
      hiddenCount: suggested.length - shownSuggested.length,
    };
  });

  const head = [
    `# Application map: ${workspace?.name ?? "Workspace"}`,
    `One workspace = one application. ${stacks.length} stacks, ${features.length} features, ${linkCount} links. Features marked "unconfirmed" are agent suggestions awaiting human review — treat them tentatively.`,
  ].join("\n");

  const recentBlock =
    recentPages.length > 0
      ? [
          "## Recent PRDs",
          ...recentPages.map((p) => `- "${p.title || "Untitled"}" (page id ${p.id})`),
        ].join("\n")
      : "";

  const render = (bs: StackBlock[]) =>
    [
      head,
      ...bs.map((b) =>
        [
          b.header,
          ...b.lines,
          ...(b.hiddenCount > 0
            ? [
                `…and ${b.hiddenCount} more — call list_features(stackId: "${b.stackId}") for the full list.`,
              ]
            : []),
          ...(b.lines.length === 0 && b.hiddenCount === 0
            ? ["(no features mapped yet)"]
            : []),
        ].join("\n"),
      ),
      recentBlock,
    ]
      .filter(Boolean)
      .join("\n\n");

  let out = render(blocks);
  if (out.length <= budgetChars || blocks.length === 0) return out;

  // Over budget: trim each stack's feature lines toward an even per-stack
  // share, surfacing the hidden count so the model reaches for tools.
  const overhead = head.length + recentBlock.length + 200;
  const perStack = Math.max(
    300,
    Math.floor((budgetChars - overhead) / blocks.length),
  );
  const trimmed = blocks.map((b) => {
    let used = b.header.length;
    const kept: string[] = [];
    for (const line of b.lines) {
      if (used + line.length > perStack) break;
      kept.push(line);
      used += line.length + 1;
    }
    return {
      ...b,
      lines: kept,
      hiddenCount: b.hiddenCount + (b.lines.length - kept.length),
    };
  });
  out = render(trimmed);
  return `${out}\n\n(The map was truncated to fit — use list_features and get_feature for anything not shown.)`;
}

/**
 * System prompt for the workspace agent chat (Step 48). Mirrors the Step 20
 * page-assistant voice, grounded in the application map instead of one PRD.
 */
export function buildAgentSystemPrompt({
  workspaceName,
  context,
}: {
  workspaceName: string;
  context: string;
}): string {
  return [
    `You are the PRDMaker workspace agent for "${workspaceName}". This workspace describes one application built from multiple stacks (frontend, backend, API, websocket, email, …); each stack owns features, and features connect across stacks through typed links.`,
    "Help the team reason about the application: which features exist, how they wire across stacks, and what a new feature or change request would touch. Be concise, concrete, and practical. Format answers in Markdown.",
    "Use your tools instead of guessing — look up stacks, features, links, and PRDs, and read a PRD before making claims about it. Refer to features by their exact names. If something isn't in the map or the documents, say so.",
    "Anything you create with tools (features, links, PRD connections) is recorded only as a suggestion that a human reviews later — it never changes the canonical map directly. When you queue suggestions, tell the user they're awaiting review in the Features → Suggestions tab.",
    "",
    "The current application map is below:",
    "<application_map>",
    context,
    "</application_map>",
  ].join("\n");
}
