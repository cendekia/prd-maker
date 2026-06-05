import "server-only";

import { AI_MANAGED_MONTHLY_TOKEN_CAP, type Plan } from "@/lib/config";
import { db } from "@/lib/db";

/** Thrown when a workspace has hit its managed-tier monthly token cap. */
export class AiQuotaExceededError extends Error {
  constructor(
    public readonly plan: Plan,
    public readonly cap: number,
    public readonly used: number,
  ) {
    super("Managed AI monthly quota exceeded.");
    this.name = "AiQuotaExceededError";
  }
}

/** UTC calendar-month bucket, e.g. "2026-06". */
export function currentPeriod(now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * The workspace's plan for managed-AI quota purposes. Billing (Step 24/25)
 * resolves the real plan from the Subscription; until then every workspace
 * meters against the FREE cap.
 */
async function resolveManagedPlan(workspaceId: string): Promise<Plan> {
  void workspaceId; // Step 24/25 will look up the Subscription plan here.
  return "FREE";
}

export interface QuotaStatus {
  plan: Plan;
  cap: number;
  used: number;
  remaining: number;
}

export async function getQuotaStatus(workspaceId: string): Promise<QuotaStatus> {
  const plan = await resolveManagedPlan(workspaceId);
  const cap = AI_MANAGED_MONTHLY_TOKEN_CAP[plan];
  const row = await db.aiUsage.findUnique({
    where: { workspaceId_period: { workspaceId, period: currentPeriod() } },
    select: { inputTokens: true, outputTokens: true },
  });
  const used = row ? row.inputTokens + row.outputTokens : 0;
  return { plan, cap, used, remaining: Math.max(0, cap - used) };
}

/**
 * Throw `AiQuotaExceededError` if the workspace has already hit its managed
 * monthly token cap. Call before a managed request; BYO requests skip this.
 */
export async function assertWithinQuota(workspaceId: string): Promise<void> {
  const { plan, cap, used } = await getQuotaStatus(workspaceId);
  if (used >= cap) {
    throw new AiQuotaExceededError(plan, cap, used);
  }
}

/**
 * Meter managed-tier token usage for the current period (upsert + atomic
 * increment). BYO requests are not metered.
 */
export async function recordUsage(
  workspaceId: string,
  usage: { inputTokens: number; outputTokens: number },
): Promise<void> {
  const period = currentPeriod();
  const inputTokens = Math.max(0, Math.round(usage.inputTokens || 0));
  const outputTokens = Math.max(0, Math.round(usage.outputTokens || 0));
  await db.aiUsage.upsert({
    where: { workspaceId_period: { workspaceId, period } },
    create: { workspaceId, period, inputTokens, outputTokens, requestCount: 1 },
    update: {
      inputTokens: { increment: inputTokens },
      outputTokens: { increment: outputTokens },
      requestCount: { increment: 1 },
    },
  });
}
