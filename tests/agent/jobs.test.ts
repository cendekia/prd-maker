import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentJobStatus, AgentJobType } from "@prisma/client";

// Mock the extraction run so job execution never makes a model call.
const extractMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agent/extract", () => ({ extractPage: extractMock }));

import { AiQuotaExceededError } from "@/lib/ai-usage";
import {
  drainAgentJobs,
  enqueueExtractPage,
  enqueueWorkspaceScan,
} from "@/lib/agent/jobs";

import { cleanupAll, createWorkspace, db, uid } from "../factory";

/**
 * DB-backed job queue (Step 54): QUEUED-dedupe on enqueue, claim → run →
 * complete on drain, attempts cap with requeue, and immediate failure on
 * quota exhaustion.
 */
describe("agent job queue", () => {
  beforeEach(() => {
    extractMock.mockReset();
    extractMock.mockResolvedValue({
      newFeatures: 0,
      reusedFeatures: 0,
      newLinks: 0,
      newPageLinks: 0,
      droppedItems: 0,
    });
  });
  afterEach(() => vi.clearAllMocks());
  afterAll(cleanupAll);

  it("dedupes a QUEUED EXTRACT_PAGE for the same page", async () => {
    const ws = await createWorkspace();
    const pageId = uid("page");
    const first = await enqueueExtractPage({ workspaceId: ws.id, pageId });
    const second = await enqueueExtractPage({ workspaceId: ws.id, pageId });
    expect(first.deduped).toBe(false);
    expect(second.deduped).toBe(true);
    expect(second.jobId).toBe(first.jobId);

    const queued = await db.agentJob.count({
      where: {
        workspaceId: ws.id,
        type: AgentJobType.EXTRACT_PAGE,
        pageId,
        status: AgentJobStatus.QUEUED,
      },
    });
    expect(queued).toBe(1);
  });

  it("dedupes a QUEUED SCAN_WORKSPACE", async () => {
    const ws = await createWorkspace();
    const a = await enqueueWorkspaceScan({ workspaceId: ws.id });
    const b = await enqueueWorkspaceScan({ workspaceId: ws.id });
    expect(a.deduped).toBe(false);
    expect(b.deduped).toBe(true);
  });

  it("claims and completes a job on drain", async () => {
    const ws = await createWorkspace();
    await enqueueExtractPage({ workspaceId: ws.id, pageId: uid("page") });
    const summary = await drainAgentJobs({ workspaceId: ws.id, limit: 1 });
    expect(summary.done).toBe(1);
    expect(extractMock).toHaveBeenCalledTimes(1);

    const job = await db.agentJob.findFirst({ where: { workspaceId: ws.id } });
    expect(job?.status).toBe(AgentJobStatus.DONE);
  });

  it("requeues a failing job until the attempts cap, then FAILS", async () => {
    extractMock.mockRejectedValue(new Error("boom"));
    const ws = await createWorkspace();
    await enqueueExtractPage({ workspaceId: ws.id, pageId: uid("page") });

    const summary = await drainAgentJobs({ workspaceId: ws.id, limit: 3 });
    expect(summary.failed).toBe(1);

    const job = await db.agentJob.findFirst({ where: { workspaceId: ws.id } });
    expect(job?.status).toBe(AgentJobStatus.FAILED);
    expect(job?.attempts).toBe(3);
    expect(job?.error).toMatch(/boom/);
  });

  it("fails immediately (no retries) when the managed quota is exhausted", async () => {
    extractMock.mockRejectedValue(new AiQuotaExceededError("FREE", 100, 100));
    const ws = await createWorkspace();
    await enqueueExtractPage({ workspaceId: ws.id, pageId: uid("page") });

    const summary = await drainAgentJobs({ workspaceId: ws.id, limit: 3 });
    expect(summary.failed).toBe(1);

    const job = await db.agentJob.findFirst({ where: { workspaceId: ws.id } });
    expect(job?.status).toBe(AgentJobStatus.FAILED);
    expect(job?.attempts).toBe(1);
  });
});
