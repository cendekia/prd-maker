"use client";

import Link from "next/link";
import { Layers, Network, RefreshCw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Onboarding explainer for the Features surface (Step 53), shown before any
 * stacks exist. Frames the mental model — one workspace is one application —
 * and points at the two setup steps: define stacks, then let the agent map
 * features from the PRDs.
 */
export function AgentEmptyState({
  workspaceSlug,
  canEdit,
}: {
  workspaceSlug: string;
  canEdit: boolean;
}) {
  return (
    <div className="mx-auto max-w-xl px-6 py-12">
      <div className="rounded-[var(--radius-xl)] border bg-background p-6">
        <div className="flex items-center gap-2 text-brand-500">
          <Network className="size-5" />
          <span className="text-[13px] font-semibold">Feature mind map</span>
        </div>
        <h2 className="t-h2 mt-3">One workspace is one application</h2>
        <p className="mt-2 text-[13px] leading-[20px] text-fg-3">
          Define the stacks your application is built from, and the agent maps
          the features in your PRDs across them — so when you draft a new
          feature or a change request, it can tell you what existing features
          it connects to or impacts, in every stack.
        </p>

        <ol className="mt-5 space-y-3">
          <Step
            n={1}
            icon={<Layers className="size-4 text-fg-3" />}
            title="Set up your stacks"
            body="Frontend, Backend, API, WebSocket, Email UI — the deployable surfaces of your app. There's a one-click default set."
          />
          <Step
            n={2}
            icon={<RefreshCw className="size-4 text-fg-3" />}
            title="Sync from your PRDs"
            body="The agent reads each PRD and proposes features and the links between them — you review before anything joins the map."
          />
          <Step
            n={3}
            icon={<Sparkles className="size-4 text-fg-3" />}
            title="Analyze impact"
            body="On any PRD, connect the features it defines or changes and run an impact analysis to see the cross-stack blast radius."
          />
        </ol>

        <div className="mt-6 flex items-center gap-2">
          {canEdit ? (
            <Button asChild>
              <Link href={`/${workspaceSlug}/settings/stacks`}>
                <Layers />
                Set up stacks
              </Link>
            </Button>
          ) : (
            <p className="text-[12px] text-fg-4">
              Ask an editor or owner to set up the application&apos;s stacks.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Step({
  n,
  icon,
  title,
  body,
}: {
  n: number;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-full)] bg-bg-muted text-[11px] font-semibold text-fg-2">
        {n}
      </span>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[13px] font-medium text-fg-1">
          {icon}
          {title}
        </p>
        <p className="mt-0.5 text-[12px] leading-[18px] text-fg-3">{body}</p>
      </div>
    </li>
  );
}
