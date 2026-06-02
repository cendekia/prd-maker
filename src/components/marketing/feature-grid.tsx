import {
  Blocks,
  Globe,
  History,
  MessageSquare,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

const FEATURES: Feature[] = [
  {
    icon: Blocks,
    title: "Block editor",
    description:
      "A familiar slash-command editor with headings, tables, checklists, code blocks, page links, and rich embeds.",
  },
  {
    icon: Users,
    title: "Real-time multiplayer",
    description:
      "Write together with live cursors and presence. Conflict-free editing keeps everyone in sync, instantly.",
  },
  {
    icon: Sparkles,
    title: "AI assistant, your key",
    description:
      "A side-panel assistant drafts and critiques specs. Bring your own Anthropic key — it’s encrypted and never leaves your control.",
  },
  {
    icon: History,
    title: "Version history you trust",
    description:
      "Automatic snapshots, plus a guaranteed snapshot before every AI edit. Diff any two versions and restore in a click.",
  },
  {
    icon: MessageSquare,
    title: "Comments & mentions",
    description:
      "Discuss inline, @mention teammates, and resolve threads without ever leaving the document.",
  },
  {
    icon: Globe,
    title: "Publish to the web",
    description:
      "Turn any PRD into a clean, read-only public page — or keep everything private to your workspace.",
  },
];

export function FeatureGrid() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <span className="t-label">Everything you need</span>
        <h2 className="mt-3 text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] text-fg-1 sm:text-[34px]">
          Built for the whole PRD lifecycle
        </h2>
        <p className="mt-4 text-[15px] leading-[24px] text-fg-2">
          From the first rough draft to a published spec the whole company can
          read — PRD Maker keeps writing, reviewing, and shipping in one place.
        </p>
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <article
            key={feature.title}
            className="group rounded-[var(--radius-xl)] border border-border bg-bg-subtle p-6 transition-colors hover:border-border-strong"
          >
            <div className="flex size-10 items-center justify-center rounded-[var(--radius-lg)] border border-border bg-background text-brand-500 transition-colors group-hover:border-brand-300">
              <feature.icon className="size-5" />
            </div>
            <h3 className="mt-4 text-[15px] font-semibold text-fg-1">
              {feature.title}
            </h3>
            <p className="mt-1.5 text-[13px] leading-[20px] text-fg-2">
              {feature.description}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
