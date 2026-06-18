import "server-only";

import { PLAN_LIMITS } from "@/lib/config";

/**
 * Plan gating — central place to ask "can this workspace do X?". Step 25 will
 * flesh this out with real Subscription/Plan logic; for now we expose the
 * helpers the publish flow (Step 23) needs and default-allow everything so
 * the spine works end-to-end without billing wired up.
 *
 * Step 25 will replace these stubs with rules like:
 *   FREE     → ≤1 workspace per owner, ≤3 members, ≤10 PRDs, no publish
 *   PRO      → unlimited except SSO/per-page ACLs
 *   BUSINESS → all
 */

export type Plan = "FREE" | "PRO" | "BUSINESS";

/**
 * Resolve the workspace's effective plan. Without a Subscription model the
 * answer is always FREE — but in dev/early-spine builds we default to PRO so
 * the publish surface is exercisable.
 *
 * Replace this with a real lookup against the `Subscription` table in Step 24.
 */
export async function getWorkspacePlan(workspaceId: string): Promise<Plan> {
  void workspaceId;
  return "PRO";
}

/** Throws if the workspace's plan does not permit publishing a page publicly. */
export async function assertCanPublish(workspaceId: string): Promise<void> {
  const plan = await getWorkspacePlan(workspaceId);
  if (plan === "FREE") {
    throw new PlanGateError(
      "Publishing is a Pro feature. Upgrade your workspace to publish pages publicly.",
      "PUBLISH_REQUIRES_PRO",
    );
  }
}

/**
 * Whether the workspace agent (feature map, agent chat, sync, impact
 * analysis) is available on this workspace's plan. True for every plan at
 * launch — see `PLAN_LIMITS[*].workspaceAgent` in src/lib/config.ts.
 * Server-only; client components receive the boolean as a prop.
 */
export async function isWorkspaceAgentEnabled(
  workspaceId: string,
): Promise<boolean> {
  const plan = await getWorkspacePlan(workspaceId);
  return PLAN_LIMITS[plan].workspaceAgent;
}

/** Throws when the workspace agent isn't permitted on the workspace's plan. */
export async function assertWorkspaceAgent(workspaceId: string): Promise<void> {
  if (!(await isWorkspaceAgentEnabled(workspaceId))) {
    throw new PlanGateError(
      "The workspace agent isn't available on your current plan. Upgrade to map features and analyze impact.",
      "AGENT_REQUIRES_UPGRADE",
    );
  }
}

export class PlanGateError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "PlanGateError";
    this.code = code;
  }
}
