import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FeatureLinkKind, PageFeatureRole, Role } from "@prisma/client";

import { executeAgentTool, type AgentToolContext } from "@/lib/agent/tools";

import {
  addMember,
  cleanupAll,
  createFeature,
  createPage,
  createStack,
  createUser,
  createWorkspace,
} from "../factory";

/**
 * The load-bearing security test (Step 54): the tool executor scopes every
 * read and write to `ctx.workspaceId` (from the session), never the model's
 * arguments. Workspace A's context must not touch workspace B's rows.
 */
describe("agent tool executor — workspace tenancy", () => {
  let ctxA: AgentToolContext;
  let viewerCtxA: AgentToolContext;
  const A: {
    stackId?: string;
    featureId?: string;
    pageId?: string;
  } = {};
  const B: {
    stackId?: string;
    featureId?: string;
    pageId?: string;
  } = {};

  beforeAll(async () => {
    // Workspace A — the actor's workspace.
    const userA = await createUser();
    const wsA = await createWorkspace();
    await addMember(wsA.id, userA.id, Role.OWNER);
    const stackA = await createStack(wsA.id);
    const featA = await createFeature(wsA.id, stackA.id, { name: "Feature A" });
    const pageA = await createPage(wsA.id, userA.id, { title: "PRD A" });
    A.stackId = stackA.id;
    A.featureId = featA.id;
    A.pageId = pageA.id;

    // Workspace B — a different tenant the actor has no access to.
    const userB = await createUser();
    const wsB = await createWorkspace();
    await addMember(wsB.id, userB.id, Role.OWNER);
    const stackB = await createStack(wsB.id);
    const featB = await createFeature(wsB.id, stackB.id, { name: "Feature B" });
    const pageB = await createPage(wsB.id, userB.id, { title: "PRD B" });
    B.stackId = stackB.id;
    B.featureId = featB.id;
    B.pageId = pageB.id;

    ctxA = { workspaceId: wsA.id, userId: userA.id, role: Role.OWNER };
    viewerCtxA = { workspaceId: wsA.id, userId: userA.id, role: Role.VIEWER };
  });

  afterAll(cleanupAll);

  it("reads its own feature (control)", async () => {
    const res = await executeAgentTool(ctxA, "get_feature", {
      featureId: A.featureId,
    });
    expect(res.ok).toBe(true);
  });

  it("refuses get_feature for another workspace's feature", async () => {
    const res = await executeAgentTool(ctxA, "get_feature", {
      featureId: B.featureId,
    });
    expect(res.ok).toBe(false);
  });

  it("list_features returns only the actor's workspace", async () => {
    const res = await executeAgentTool(ctxA, "list_features", {});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const ids = (JSON.parse(res.content) as { featureId: string }[]).map(
      (f) => f.featureId,
    );
    expect(ids).toContain(A.featureId);
    expect(ids).not.toContain(B.featureId);
  });

  it("reads its own page but refuses another workspace's page", async () => {
    const own = await executeAgentTool(ctxA, "read_page", { pageId: A.pageId });
    expect(own.ok).toBe(true);
    const foreign = await executeAgentTool(ctxA, "read_page", {
      pageId: B.pageId,
    });
    expect(foreign.ok).toBe(false);
  });

  it("refuses propose_feature into another workspace's stack", async () => {
    const res = await executeAgentTool(ctxA, "propose_feature", {
      stackId: B.stackId,
      name: "Injected",
      summary: "should not be created",
    });
    expect(res.ok).toBe(false);
  });

  it("refuses propose_link crossing workspaces", async () => {
    const res = await executeAgentTool(ctxA, "propose_link", {
      fromFeatureId: A.featureId,
      toFeatureId: B.featureId,
      kind: FeatureLinkKind.CONSUMES,
      rationale: "cross-tenant",
    });
    expect(res.ok).toBe(false);
  });

  it("refuses link_page_feature for another workspace's page", async () => {
    const res = await executeAgentTool(ctxA, "link_page_feature", {
      pageId: B.pageId,
      featureId: A.featureId,
      role: PageFeatureRole.REFERENCES,
    });
    expect(res.ok).toBe(false);
  });

  it("blocks write tools for VIEWER role", async () => {
    const res = await executeAgentTool(viewerCtxA, "propose_feature", {
      stackId: A.stackId,
      name: "Viewer attempt",
      summary: "viewers can't write",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/VIEWER|role/i);
  });

  it("rejects unknown tools and invalid arguments", async () => {
    const unknown = await executeAgentTool(ctxA, "drop_tables", {});
    expect(unknown.ok).toBe(false);
    const badArgs = await executeAgentTool(ctxA, "propose_link", {
      fromFeatureId: A.featureId,
      toFeatureId: A.featureId,
      kind: "NOT_A_KIND",
      rationale: "x",
    });
    expect(badArgs.ok).toBe(false);
  });
});
