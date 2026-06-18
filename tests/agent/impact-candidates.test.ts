import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FeatureLinkKind, PageFeatureRole } from "@prisma/client";

import { assembleImpactCandidates } from "@/lib/agent/impact";

import {
  cleanupAll,
  createFeature,
  createLink,
  createPage,
  createPageFeature,
  createStack,
  createUser,
  createWorkspace,
} from "../factory";

/**
 * Deterministic impact-candidate assembly (Step 54): the PRD's connected
 * features plus their ≤depth-hop neighborhood, in stable order. Fixture:
 * X→Y→Z chain, W unconnected; the PRD DEFINES X and REFERENCES Y.
 */
describe("impact — assembleImpactCandidates", () => {
  let workspaceId: string;
  let pageId: string;
  const f: Record<string, string> = {};

  beforeAll(async () => {
    const user = await createUser();
    const ws = await createWorkspace();
    workspaceId = ws.id;
    const stack = await createStack(ws.id);
    for (const name of ["X", "Y", "Z", "W"]) {
      f[name] = (await createFeature(ws.id, stack.id, { name })).id;
    }
    await createLink(ws.id, f.X, f.Y, FeatureLinkKind.CONSUMES);
    await createLink(ws.id, f.Y, f.Z, FeatureLinkKind.CONSUMES);

    const page = await createPage(ws.id, user.id, { contentText: "PRD body" });
    pageId = page.id;
    // Two joins, created in a known order to assert deterministic ordering.
    await createPageFeature(page.id, f.X, PageFeatureRole.DEFINES);
    await createPageFeature(page.id, f.Y, PageFeatureRole.REFERENCES);
  });

  afterAll(cleanupAll);

  it("links the connected features and walks 2 hops", async () => {
    const { linkedIds, candidateIds } = await assembleImpactCandidates(
      workspaceId,
      pageId,
      2,
    );
    expect(new Set(linkedIds)).toEqual(new Set([f.X, f.Y]));
    // X,Y are linked; Z is reachable within 2 hops of X; W is unconnected.
    expect(candidateIds).toContain(f.X);
    expect(candidateIds).toContain(f.Y);
    expect(candidateIds).toContain(f.Z);
    expect(candidateIds).not.toContain(f.W);
  });

  it("respects the hop depth", async () => {
    // From the linked set {X,Y}, Z is 1 hop from Y, so depth 1 already
    // includes it; assert W stays excluded at depth 1.
    const { candidateIds } = await assembleImpactCandidates(
      workspaceId,
      pageId,
      1,
    );
    expect(candidateIds).not.toContain(f.W);
  });

  it("returns joins in deterministic creation order", async () => {
    const { joins } = await assembleImpactCandidates(workspaceId, pageId, 2);
    expect(joins.map((j) => j.role)).toEqual([
      PageFeatureRole.DEFINES,
      PageFeatureRole.REFERENCES,
    ]);
  });
});
