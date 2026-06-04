import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/* ----------------------------- doc helpers ----------------------------- */
// Build TipTap/ProseMirror document JSON. Templates store the page *body*;
// the page title is set separately when a page is created from a template.

type Doc = Record<string, unknown>;

const h = (level: 1 | 2 | 3, text: string): Doc => ({
  type: "heading",
  attrs: { level },
  content: [{ type: "text", text }],
});
const p = (text?: string): Doc =>
  text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" };
const bullets = (...items: string[]): Doc => ({
  type: "bulletList",
  content: items.map((t) => ({ type: "listItem", content: [p(t)] })),
});
const ordered = (...items: string[]): Doc => ({
  type: "orderedList",
  content: items.map((t) => ({ type: "listItem", content: [p(t)] })),
});
const tasks = (...items: string[]): Doc => ({
  type: "taskList",
  content: items.map((t) => ({
    type: "taskItem",
    attrs: { checked: false },
    content: [p(t)],
  })),
});
const doc = (...content: Doc[]): Doc => ({ type: "doc", content });

/* --------------------------- system templates --------------------------- */
// Deterministic ids make `prisma db seed` idempotent (upsert, never duplicate).

interface SystemTemplate {
  id: string;
  name: string;
  description: string;
  content: Doc;
}

const SYSTEM_TEMPLATES: SystemTemplate[] = [
  {
    id: "sys-feature-prd",
    name: "Feature PRD",
    description: "Define a feature: problem, goals, requirements, and success metrics.",
    content: doc(
      h(2, "Overview"),
      p("One or two sentences on what this feature is and why it matters now."),
      h(2, "Problem"),
      p("What problem are we solving, and for whom?"),
      h(2, "Goals"),
      bullets("Goal 1", "Goal 2"),
      h(2, "Non-goals"),
      bullets("Explicitly out of scope"),
      h(2, "Requirements"),
      tasks("Requirement 1", "Requirement 2"),
      h(2, "Success metrics"),
      p("How will we know this worked?"),
      h(2, "Open questions"),
      p(),
    ),
  },
  {
    id: "sys-tech-spec",
    name: "Tech Spec",
    description: "Engineering design doc: context, proposed design, alternatives, rollout.",
    content: doc(
      h(2, "Summary"),
      p("A short summary of what is being built and why."),
      h(2, "Context & background"),
      p(),
      h(2, "Proposed design"),
      p(),
      h(2, "Alternatives considered"),
      bullets("Alternative A — why not", "Alternative B — why not"),
      h(2, "Risks & mitigations"),
      p(),
      h(2, "Rollout plan"),
      tasks("Migration", "Feature flag", "Monitoring & metrics"),
    ),
  },
  {
    id: "sys-rfc",
    name: "RFC",
    description: "Propose a change for team feedback: motivation, proposal, drawbacks.",
    content: doc(
      h(2, "Summary"),
      p("One paragraph explaining the proposal."),
      h(2, "Motivation"),
      p("Why are we doing this? What use cases does it support?"),
      h(2, "Proposal"),
      p(),
      h(2, "Drawbacks"),
      p(),
      h(2, "Alternatives"),
      p(),
      h(2, "Unresolved questions"),
      p(),
    ),
  },
  {
    id: "sys-one-pager",
    name: "One-Pager",
    description: "A concise pitch: the problem, your proposal, impact, and next steps.",
    content: doc(
      h(2, "Problem"),
      p("What's broken or missing?"),
      h(2, "Proposal"),
      p("What do you propose, in a nutshell?"),
      h(2, "Impact"),
      p("Who benefits, and how much?"),
      h(2, "Next steps"),
      tasks("Step 1", "Step 2"),
    ),
  },
  {
    id: "sys-bug-report",
    name: "Bug Report",
    description: "Capture a bug: repro steps, expected vs actual behavior, environment.",
    content: doc(
      h(2, "Summary"),
      p("A clear, one-line description of the bug."),
      h(2, "Steps to reproduce"),
      ordered("Go to …", "Click on …", "Observe …"),
      h(2, "Expected behavior"),
      p(),
      h(2, "Actual behavior"),
      p(),
      h(2, "Environment"),
      bullets("Browser / OS:", "App version:", "URL:"),
      h(2, "Severity"),
      p("Blocker / Major / Minor / Trivial"),
    ),
  },
];

async function main() {
  for (const t of SYSTEM_TEMPLATES) {
    await prisma.template.upsert({
      where: { id: t.id },
      create: {
        id: t.id,
        workspaceId: null,
        name: t.name,
        description: t.description,
        contentJson: t.content as Prisma.InputJsonValue,
      },
      update: {
        name: t.name,
        description: t.description,
        contentJson: t.content as Prisma.InputJsonValue,
      },
    });
    console.log(`  ✓ ${t.name}`);
  }
  console.log(`Seeded ${SYSTEM_TEMPLATES.length} system templates.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
