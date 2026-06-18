import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  FeatureLinkKind,
  FeatureStatus,
  PageFeatureRole,
  Role,
} from "@prisma/client";

import { mergeSuggestedFeature } from "@/lib/agent/features";

import {
  cleanupAll,
  createFeature,
  createLink,
  createPage,
  createPageFeature,
  createStack,
  createUser,
  createWorkspace,
  db,
} from "../factory";

/**
 * Merging a suggested duplicate into an existing feature (Step 54): its links
 * and PRD joins re-point to the target, rows that would collide with an
 * existing triple are dropped, self-links are removed, and the duplicate is
 * archived (its name tombstoned). No edge may still reference the duplicate.
 */
describe("mergeSuggestedFeature — re-pointing", () => {
  let T: string; // target
  let D: string; // suggested duplicate
  let O: string; // other

  beforeAll(async () => {
    const user = await createUser();
    const ws = await createWorkspace();
    const stack = await createStack(ws.id);
    T = (await createFeature(ws.id, stack.id, { name: "Target" })).id;
    O = (await createFeature(ws.id, stack.id, { name: "Other" })).id;
    D = (
      await createFeature(ws.id, stack.id, {
        name: "Duplicate",
        status: FeatureStatus.SUGGESTED,
      })
    ).id;

    // Re-points cleanly: D→O CONSUMES has no T→O CONSUMES counterpart.
    await createLink(ws.id, D, O, FeatureLinkKind.CONSUMES);
    // Collision: both T→O and D→O exist with TRIGGERS — the dup's is dropped.
    await createLink(ws.id, T, O, FeatureLinkKind.TRIGGERS);
    await createLink(ws.id, D, O, FeatureLinkKind.TRIGGERS);
    // Self-link after re-point (D→T CONSUMES → T→T) — removed.
    await createLink(ws.id, D, T, FeatureLinkKind.CONSUMES);

    // PRD join on the duplicate re-points to the target.
    const page = await createPage(ws.id, user.id);
    await createPageFeature(page.id, D, PageFeatureRole.DEFINES);

    await mergeSuggestedFeature({
      workspaceId: ws.id,
      actorRole: Role.OWNER,
      featureId: D,
      targetFeatureId: T,
    });
  });

  afterAll(cleanupAll);

  it("archives the duplicate", async () => {
    const dup = await db.feature.findUnique({
      where: { id: D },
      select: { archivedAt: true },
    });
    expect(dup?.archivedAt).not.toBeNull();
  });

  it("leaves no link or join referencing the duplicate", async () => {
    const links = await db.featureLink.count({
      where: { OR: [{ fromFeatureId: D }, { toFeatureId: D }] },
    });
    expect(links).toBe(0);
    const joins = await db.pageFeature.count({ where: { featureId: D } });
    expect(joins).toBe(0);
  });

  it("re-points the non-colliding link to the target", async () => {
    const consumes = await db.featureLink.count({
      where: {
        fromFeatureId: T,
        toFeatureId: O,
        kind: FeatureLinkKind.CONSUMES,
      },
    });
    expect(consumes).toBe(1);
  });

  it("drops the colliding link, keeping a single target edge", async () => {
    const triggers = await db.featureLink.count({
      where: {
        fromFeatureId: T,
        toFeatureId: O,
        kind: FeatureLinkKind.TRIGGERS,
      },
    });
    expect(triggers).toBe(1);
  });

  it("removes the would-be self-link", async () => {
    const selfLinks = await db.featureLink.count({
      where: { fromFeatureId: T, toFeatureId: T },
    });
    expect(selfLinks).toBe(0);
  });

  it("re-points the PRD join to the target", async () => {
    const onTarget = await db.pageFeature.count({
      where: { featureId: T, role: PageFeatureRole.DEFINES },
    });
    expect(onTarget).toBe(1);
  });
});
