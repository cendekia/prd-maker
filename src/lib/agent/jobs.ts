import "server-only";

import { AgentJobStatus, AgentJobType, type AgentJob } from "@prisma/client";

import { AiQuotaExceededError } from "@/lib/ai-usage";
import { extractPage } from "@/lib/agent/extract";
import { db } from "@/lib/db";

/**
 * DB-backed agent job queue (ai_development_plan.md Step 49) — the same
 * infra-free pattern as the snapshot cron. Jobs are enqueued by the sync
 * button, the publish/snapshot hooks, and SCAN_WORKSPACE fan-out; they're
 * drained by /api/cron/agent-sync (small batches) and opportunistically by
 * the manual-sync POST (deadline-bounded burst).
 */

const MAX_ATTEMPTS = 3;

export interface EnqueueResult {
  jobId: string;
  /** True when an identical job was already queued. */
  deduped: boolean;
}

/** Queue one page extraction. Dedupes against an existing QUEUED twin. */
export async function enqueueExtractPage(opts: {
  workspaceId: string;
  pageId: string;
  requestedById?: string | null;
}): Promise<EnqueueResult> {
  const existing = await db.agentJob.findFirst({
    where: {
      workspaceId: opts.workspaceId,
      type: AgentJobType.EXTRACT_PAGE,
      pageId: opts.pageId,
      status: AgentJobStatus.QUEUED,
    },
    select: { id: true },
  });
  if (existing) return { jobId: existing.id, deduped: true };

  const job = await db.agentJob.create({
    data: {
      workspaceId: opts.workspaceId,
      type: AgentJobType.EXTRACT_PAGE,
      pageId: opts.pageId,
      requestedById: opts.requestedById ?? null,
    },
    select: { id: true },
  });
  return { jobId: job.id, deduped: false };
}

/** Queue a whole-workspace scan (fans out one EXTRACT_PAGE per live page). */
export async function enqueueWorkspaceScan(opts: {
  workspaceId: string;
  requestedById?: string | null;
}): Promise<EnqueueResult> {
  const existing = await db.agentJob.findFirst({
    where: {
      workspaceId: opts.workspaceId,
      type: AgentJobType.SCAN_WORKSPACE,
      status: AgentJobStatus.QUEUED,
    },
    select: { id: true },
  });
  if (existing) return { jobId: existing.id, deduped: true };

  const job = await db.agentJob.create({
    data: {
      workspaceId: opts.workspaceId,
      type: AgentJobType.SCAN_WORKSPACE,
      requestedById: opts.requestedById ?? null,
    },
    select: { id: true },
  });
  return { jobId: job.id, deduped: false };
}

export interface AgentSyncStatus {
  queued: number;
  running: number;
  lastFinishedAt: string | null;
  lastError: string | null;
}

/** Queue stats for the sync button (Features surface). */
export async function getAgentSyncStatus(
  workspaceId: string,
): Promise<AgentSyncStatus> {
  const [queued, running, lastDone, lastFailed] = await Promise.all([
    db.agentJob.count({
      where: { workspaceId, status: AgentJobStatus.QUEUED },
    }),
    db.agentJob.count({
      where: { workspaceId, status: AgentJobStatus.RUNNING },
    }),
    db.agentJob.findFirst({
      where: { workspaceId, status: AgentJobStatus.DONE },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    db.agentJob.findFirst({
      where: { workspaceId, status: AgentJobStatus.FAILED },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true, error: true },
    }),
  ]);
  return {
    queued,
    running,
    lastFinishedAt: lastDone?.updatedAt.toISOString() ?? null,
    lastError:
      lastFailed && (!lastDone || lastFailed.updatedAt > lastDone.updatedAt)
        ? lastFailed.error
        : null,
  };
}

/**
 * Optimistically claim the oldest QUEUED job (optionally scoped to one
 * workspace): the QUEUED→RUNNING updateMany only wins for one concurrent
 * drainer, so cron and manual sync can overlap safely.
 */
async function claimNextJob(workspaceId?: string): Promise<AgentJob | null> {
  for (let i = 0; i < 5; i++) {
    const candidate = await db.agentJob.findFirst({
      where: { status: AgentJobStatus.QUEUED, ...(workspaceId ? { workspaceId } : {}) },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!candidate) return null;
    const claimed = await db.agentJob.updateMany({
      where: { id: candidate.id, status: AgentJobStatus.QUEUED },
      data: { status: AgentJobStatus.RUNNING, attempts: { increment: 1 } },
    });
    if (claimed.count === 1) {
      return db.agentJob.findUnique({ where: { id: candidate.id } });
    }
    // Lost the race — try the next candidate.
  }
  return null;
}

async function runJob(job: AgentJob): Promise<void> {
  if (job.type === AgentJobType.SCAN_WORKSPACE) {
    const pages = await db.page.findMany({
      where: { workspaceId: job.workspaceId, archivedAt: null },
      select: { id: true },
    });
    for (const page of pages) {
      await enqueueExtractPage({
        workspaceId: job.workspaceId,
        pageId: page.id,
        requestedById: job.requestedById,
      });
    }
    return;
  }
  // EXTRACT_PAGE — a vanished page is a no-op, not an error.
  if (!job.pageId) return;
  await extractPage({ workspaceId: job.workspaceId, pageId: job.pageId });
}

export interface DrainSummary {
  claimed: number;
  done: number;
  failed: number;
  requeued: number;
}

/**
 * Claim-and-run jobs sequentially until the limit, the deadline, or an empty
 * queue. Failures requeue until the attempts cap; quota exhaustion fails
 * immediately (retrying inside the same billing month can't succeed).
 */
export async function drainAgentJobs(opts: {
  limit?: number;
  deadlineMs?: number;
  workspaceId?: string;
}): Promise<DrainSummary> {
  const limit = opts.limit ?? 3;
  const deadline = Date.now() + (opts.deadlineMs ?? 50_000);
  const summary: DrainSummary = { claimed: 0, done: 0, failed: 0, requeued: 0 };

  while (summary.claimed < limit && Date.now() < deadline) {
    const job = await claimNextJob(opts.workspaceId);
    if (!job) break;
    summary.claimed++;

    try {
      await runJob(job);
      await db.agentJob.update({
        where: { id: job.id },
        data: { status: AgentJobStatus.DONE, error: null },
      });
      summary.done++;
    } catch (e) {
      const message = (e as Error).message;
      const fatal =
        e instanceof AiQuotaExceededError || job.attempts >= MAX_ATTEMPTS;
      await db.agentJob.update({
        where: { id: job.id },
        data: {
          status: fatal ? AgentJobStatus.FAILED : AgentJobStatus.QUEUED,
          error: message,
        },
      });
      if (fatal) summary.failed++;
      else summary.requeued++;
    }
  }
  return summary;
}
