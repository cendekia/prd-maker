import Link from "next/link";
import { ArrowRight, Send, Share2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Ambient brand glow behind the hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] opacity-70 dark:opacity-25"
        style={{
          backgroundImage:
            "radial-gradient(60% 60% at 50% 0%, var(--accent-100), transparent)",
        }}
      />

      <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-5 pb-12 pt-16 text-center sm:px-8 sm:pb-14 sm:pt-24">
        <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-full)] border border-border bg-bg-subtle px-3 py-1 text-[12px] font-medium text-fg-2">
          <Sparkles className="size-3.5 text-brand-500" />
          Real-time editor · Bring your own AI key
        </span>

        <h1 className="mt-5 max-w-2xl text-[34px] font-semibold leading-[1.08] tracking-[-0.025em] text-fg-1 sm:text-[48px]">
          Where product teams write PRDs together.
        </h1>

        <p className="mt-5 max-w-xl text-[16px] leading-[26px] text-fg-2">
          A Confluence-style editor for product requirements — real-time
          multiplayer, version history, comments, and an integrated AI panel
          that drafts, critiques, and answers questions using your own API key.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/sign-in">
              Get started — it&apos;s free
              <ArrowRight />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/pricing">See pricing</Link>
          </Button>
        </div>

        <p className="t-meta mt-4">
          Free for small teams · No credit card required
        </p>
      </div>

      <div className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-8 sm:pb-24">
        <ProductPreview />
      </div>
    </section>
  );
}

/**
 * A faux three-pane app screenshot built in markup (no image asset), so it
 * stays crisp at any resolution and adapts to light/dark via design tokens.
 * Shows the page tree, the PRD editor, and a live AI-panel exchange.
 */
function ProductPreview() {
  return (
    <div className="overflow-hidden rounded-[var(--radius-xl)] border border-border bg-background shadow-[var(--shadow-xl)]">
      {/* Top bar */}
      <div className="flex h-11 items-center justify-between border-b border-border bg-bg-subtle px-4">
        <div className="flex items-center gap-2 text-[12px] text-fg-3">
          <span className="hidden sm:inline">Acme Product</span>
          <span className="hidden sm:inline text-fg-4">/</span>
          <span className="text-fg-1">Checkout Redesign PRD</span>
        </div>
        <div className="flex items-center gap-3">
          <PresenceAvatars />
          <span className="hidden items-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-background px-2.5 py-1 text-[12px] font-medium text-fg-2 sm:inline-flex">
            <Share2 className="size-3.5" />
            Share
          </span>
        </div>
      </div>

      {/* Body: tree · editor · AI panel */}
      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] lg:grid-cols-[180px_1fr_236px]">
        {/* Page tree */}
        <aside className="hidden border-r border-border bg-bg-sidebar p-3 md:block">
          <p className="t-label mb-2 px-1.5">Workspace</p>
          <TreeRow label="Roadmap" />
          <TreeRow label="Checkout Redesign" active />
          <TreeRow label="Problem & goals" depth={1} active />
          <TreeRow label="Requirements" depth={1} />
          <TreeRow label="Open questions" depth={1} />
          <TreeRow label="Discovery notes" />
          <TreeRow label="Tech spec" />
        </aside>

        {/* Editor */}
        <div className="min-h-[300px] px-6 py-7 sm:px-10">
          <div className="mx-auto max-w-[460px]">
            <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-fg-1">
              Checkout Redesign PRD
            </h2>
            <p className="mt-1 text-[12px] text-fg-3">
              Edited just now · 3 collaborators
            </p>

            <h3 className="mt-6 text-[15px] font-semibold text-fg-1">Problem</h3>
            <SkeletonLines className="mt-2" widths={["100%", "92%", "76%"]} />

            <h3 className="mt-5 text-[15px] font-semibold text-fg-1">
              Acceptance criteria
            </h3>
            <div className="mt-2 space-y-2">
              <CheckItem checked>Guest checkout completes in ≤ 3 steps</CheckItem>
              <CheckItem checked>Saved cards surface on return visits</CheckItem>
              <CheckItem>Error states recover without data loss</CheckItem>
            </div>

            <h3 className="mt-5 text-[15px] font-semibold text-fg-1">Goals</h3>
            <SkeletonLines className="mt-2" widths={["88%", "70%"]} />
          </div>
        </div>

        {/* AI panel */}
        <aside className="hidden border-l border-border bg-bg-subtle lg:flex lg:flex-col">
          <div className="flex items-center gap-1.5 border-b border-border px-4 py-3 text-[12px] font-medium text-fg-1">
            <Sparkles className="size-3.5 text-brand-500" />
            AI Assistant
          </div>
          <div className="flex-1 space-y-3 px-3 py-4">
            <div className="ml-auto max-w-[88%] rounded-[var(--radius-lg)] rounded-br-[var(--radius-xs)] bg-brand-500 px-3 py-2 text-[12px] leading-[17px] text-white">
              Draft acceptance criteria for guest checkout.
            </div>
            <div className="max-w-[92%] rounded-[var(--radius-lg)] rounded-bl-[var(--radius-xs)] border border-border bg-background px-3 py-2">
              <p className="text-[12px] leading-[17px] text-fg-2">
                Here are three criteria based on the Problem section:
              </p>
              <SkeletonLines
                className="mt-2"
                widths={["100%", "84%", "94%"]}
                tone="muted"
              />
            </div>
          </div>
          <div className="border-t border-border p-3">
            <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-background px-2.5 py-1.5">
              <span className="flex-1 text-[12px] text-fg-4">Ask anything…</span>
              <span className="flex size-6 items-center justify-center rounded-[var(--radius-sm)] bg-brand-500 text-white">
                <Send className="size-3" />
              </span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function PresenceAvatars() {
  const people = [
    { initial: "M", tone: "bg-presence-1" },
    { initial: "J", tone: "bg-presence-4" },
    { initial: "R", tone: "bg-presence-5" },
  ];
  return (
    <div className="flex -space-x-1.5">
      {people.map((p) => (
        <span
          key={p.initial}
          className={cn(
            "flex size-6 items-center justify-center rounded-[var(--radius-full)] text-[10px] font-semibold text-white ring-2 ring-bg-subtle",
            p.tone,
          )}
        >
          {p.initial}
        </span>
      ))}
    </div>
  );
}

function TreeRow({
  label,
  active,
  depth = 0,
}: {
  label: string;
  active?: boolean;
  depth?: number;
}) {
  return (
    <div
      className={cn(
        "flex items-center rounded-[var(--radius-sm)] px-1.5 py-1 text-[12px]",
        active ? "bg-bg-active text-fg-1" : "text-fg-2",
      )}
      style={{ paddingLeft: 6 + depth * 12 }}
    >
      <span className="truncate">{label}</span>
    </div>
  );
}

function CheckItem({
  children,
  checked,
}: {
  children: React.ReactNode;
  checked?: boolean;
}) {
  return (
    <div className="flex items-start gap-2 text-[13px] leading-[19px]">
      <span
        className={cn(
          "mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-[var(--radius-xs)] border",
          checked
            ? "border-brand-500 bg-brand-500 text-white"
            : "border-border-strong",
        )}
      >
        {checked ? (
          <svg viewBox="0 0 12 12" className="size-2.5" fill="none">
            <path
              d="M2.5 6.2 4.7 8.4 9.5 3.6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </span>
      <span className={cn(checked ? "text-fg-2 line-through decoration-fg-4" : "text-fg-1")}>
        {children}
      </span>
    </div>
  );
}

function SkeletonLines({
  widths,
  className,
  tone = "default",
}: {
  widths: string[];
  className?: string;
  tone?: "default" | "muted";
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {widths.map((w, i) => (
        <div
          key={i}
          className={cn(
            "h-2 rounded-[var(--radius-full)]",
            tone === "muted" ? "bg-border" : "bg-bg-active",
          )}
          style={{ width: w }}
        />
      ))}
    </div>
  );
}
