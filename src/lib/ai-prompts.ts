/**
 * Bundled prompt templates for the guided Request → Plan → Spec workflow
 * (Step 21). These adapt the project's bundled `request_prompt.md` and
 * `plan_prompt.md` "template logic" into stage system prompts, plus a final
 * spec stage. Deliverables are emitted as clean Markdown (not fenced) so the
 * "Apply to page" button can convert them straight into formatted PRD content.
 *
 * Isomorphic — imported by the chat route (server) and the panel UI (client),
 * so it must not import server-only modules.
 */

export const GUIDED_STAGE_IDS = ["request", "plan", "spec"] as const;
export type GuidedStage = (typeof GUIDED_STAGE_IDS)[number];

export interface GuidedStageMeta {
  id: GuidedStage;
  label: string;
  blurb: string;
  /** Placeholder shown in the composer while on this stage. */
  placeholder: string;
}

export const GUIDED_STAGES: GuidedStageMeta[] = [
  {
    id: "request",
    label: "Request",
    blurb: "Clarify the idea into a structured project request.",
    placeholder: "Describe your idea — or ask me to refine the request…",
  },
  {
    id: "plan",
    label: "Plan",
    blurb: "Break the request into a step-by-step implementation plan.",
    placeholder: "Ask me to draft or adjust the plan…",
  },
  {
    id: "spec",
    label: "Spec",
    blurb: "Synthesize the final technical specification.",
    placeholder: "Ask me to write or refine the spec…",
  },
];

export function isGuidedStage(value: unknown): value is GuidedStage {
  return (
    typeof value === "string" &&
    (GUIDED_STAGE_IDS as readonly string[]).includes(value)
  );
}

const PREAMBLE =
  "You are the PRDMaker guided assistant, walking a product manager from a raw idea to a finished PRD in three stages: Request → Plan → Spec. Work collaboratively and iteratively. Ask clarifying questions when something is ambiguous, suggest things the user may have missed, and flag risky decisions. Always respond with clean GitHub-flavored Markdown using real headings and bullet/checkbox lists — never wrap the deliverable in a code fence, because the user will apply it straight into the document.";

const STAGE_INSTRUCTIONS: Record<GuidedStage, string> = {
  // Adapted from request_prompt.md
  request: [
    "STAGE: REQUEST. Turn the idea into a complete project request. After each exchange, output the current state of the request using this structure (as plain Markdown):",
    "",
    "# <Project Name>",
    "## Project Description",
    "## Target Audience",
    "## Desired Features",
    "### <Feature Category>",
    "- [ ] <Requirement>",
    "  - [ ] <Sub-requirement>",
    "## Design Requests",
    "- [ ] <Design requirement>",
    "## Other Notes",
    "- <Additional considerations>",
    "",
    "Ask about anything underspecified, propose features the user may have missed, organize requirements logically, and flag technical challenges. Keep iterating until the user says the request is complete.",
  ].join("\n"),
  // Adapted from plan_prompt.md
  plan: [
    "STAGE: PLAN. Using the project request established earlier in this conversation (and the current document), produce a detailed, step-by-step implementation plan a code-generation agent could follow. Break work into small, sequential, self-contained steps that each touch only a handful of files. Output as plain Markdown:",
    "",
    "## <Section Name>",
    "- [ ] Step <n>: <Brief title>",
    "  - Task: <what to implement>",
    "  - Files: <key files to create/modify>",
    "  - Step Dependencies: <prior steps>",
    "  - User Instructions: <manual steps, if any>",
    "",
    "Cover the full request, order steps so dependencies come first, and include steps for data, APIs, UI, auth, and tests.",
  ].join("\n"),
  // Authored final spec stage
  spec: [
    "STAGE: SPEC. Synthesize everything from this conversation (the request and the plan) and the current document into a single, polished technical specification — the finished PRD. Output as plain Markdown with these sections:",
    "",
    "# <Title>",
    "## Overview & Goals",
    "## Problem Statement",
    "## Users & Use Cases",
    "## Functional Requirements",
    "## Non-Functional Requirements",
    "## Architecture & Data Model",
    "## Milestones",
    "## Open Questions & Risks",
    "",
    "Be concrete and decisive: resolve open questions where you reasonably can, and call out the rest under Open Questions.",
  ].join("\n"),
};

/**
 * Build the system prompt for a guided stage, grounded in the current page.
 * Prior-stage deliverables live in the conversation history, so the model sees
 * them without re-injection here.
 */
export function buildGuidedSystemPrompt(
  stage: GuidedStage,
  { title, text }: { title: string; text: string },
): string {
  const clean = text.trim();
  const doc =
    clean.length > 12_000 ? `${clean.slice(0, 12_000)}\n…[truncated]` : clean;

  return [
    PREAMBLE,
    "",
    STAGE_INSTRUCTIONS[stage],
    "",
    `The user is working on a PRD titled "${title}". Current document content:`,
    "<document>",
    doc || "(empty)",
    "</document>",
  ].join("\n");
}
