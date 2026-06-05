"use client";

import Link from "next/link";
import { KeyRound, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { QuotaInfo } from "@/hooks/use-ai-chat";

/**
 * Shown when the workspace has exhausted its managed monthly AI allowance
 * (Step 20). Steers the user to either add a personal Anthropic key (which
 * bypasses the managed cap) or move to a higher plan.
 */
export function QuotaNotice({ quota }: { quota: QuotaInfo | null }) {
  return (
    <div className="m-3 rounded-[var(--radius-lg)] border bg-background p-4 text-center">
      <Sparkles className="mx-auto mb-2 size-5 text-brand-500" />
      <p className="text-[13px] font-medium text-fg-1">
        You&apos;re out of managed AI credits this month
      </p>
      <p className="mt-1 text-[12px] leading-[18px] text-fg-3">
        {quota
          ? `Your workspace has used its ${quota.cap.toLocaleString()}-token monthly allowance on the ${quota.plan} plan.`
          : "Your workspace has used its monthly allowance."}{" "}
        Add your own Anthropic key to keep going — it uses a stronger model and
        skips this limit.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        <Button asChild className="w-full">
          <Link href="/account/api-keys">
            <KeyRound className="size-4" />
            Add your Anthropic key
          </Link>
        </Button>
        <Button asChild variant="outline" className="w-full">
          <Link href="/pricing">See plans</Link>
        </Button>
      </div>
    </div>
  );
}
