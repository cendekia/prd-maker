import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FeatureLinkKind, SuggestionStatus } from "@prisma/client";

import { neighbors, subgraph } from "@/lib/agent/features";

import {
  cleanupAll,
  createFeature,
  createLink,
  createStack,
  createWorkspace,
} from "../factory";

/**
 * n-hop neighborhood queries (Step 54). Fixture is a chain A→B→C→D plus a
 * feature E reachable from A only through a REJECTED link, which must never
 * be traversed.
 */
describe("feature graph — subgraph / neighbors", () => {
  let workspaceId: string;
  const f: Record<string, string> = {};

  beforeAll(async () => {
    const ws = await createWorkspace();
    workspaceId = ws.id;
    const stack = await createStack(ws.id);
    for (const name of ["A", "B", "C", "D", "E"]) {
      f[name] = (await createFeature(ws.id, stack.id, { name })).id;
    }
    await createLink(ws.id, f.A, f.B, FeatureLinkKind.CONSUMES);
    await createLink(ws.id, f.B, f.C, FeatureLinkKind.CONSUMES);
    await createLink(ws.id, f.C, f.D, FeatureLinkKind.CONSUMES);
    // A→E exists only as a REJECTED link — must be excluded from traversal.
    await createLink(ws.id, f.A, f.E, FeatureLinkKind.RELATES_TO, {
      status: SuggestionStatus.REJECTED,
    });
  });

  afterAll(cleanupAll);

  it("1-hop from A reaches B, not C/D", async () => {
    const { featureIds } = await subgraph(workspaceId, [f.A], 1);
    const set = new Set(featureIds);
    expect(set.has(f.A)).toBe(true);
    expect(set.has(f.B)).toBe(true);
    expect(set.has(f.C)).toBe(false);
    expect(set.has(f.D)).toBe(false);
  });

  it("2-hop from A reaches C, not D", async () => {
    const { featureIds } = await subgraph(workspaceId, [f.A], 2);
    const set = new Set(featureIds);
    expect(set.has(f.C)).toBe(true);
    expect(set.has(f.D)).toBe(false);
  });

  it("3-hop from A reaches the whole chain", async () => {
    const { featureIds } = await subgraph(workspaceId, [f.A], 3);
    for (const n of ["A", "B", "C", "D"]) {
      expect(featureIds).toContain(f[n]);
    }
  });

  it("never traverses a REJECTED link, at any depth", async () => {
    const { featureIds } = await subgraph(workspaceId, [f.A], 5);
    expect(featureIds).not.toContain(f.E);
  });

  it("neighbors(B) returns both incident links, excluding rejected", async () => {
    const links = await neighbors(workspaceId, f.B);
    expect(links).toHaveLength(2);
    const pairs = links.map((l) => `${l.fromFeatureId}->${l.toFeatureId}`);
    expect(pairs).toContain(`${f.A}->${f.B}`);
    expect(pairs).toContain(`${f.B}->${f.C}`);
  });

  it("neighbors(A) excludes the rejected A→E link", async () => {
    const links = await neighbors(workspaceId, f.A);
    expect(links.every((l) => l.toFeatureId !== f.E)).toBe(true);
  });
});
