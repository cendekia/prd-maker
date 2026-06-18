import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  FeatureLinkKind,
  FeatureStatus,
  PageFeatureRole,
  SuggestionStatus,
} from "@prisma/client";

import { applyExtraction } from "@/lib/agent/extract";
import type { ExtractionResult } from "@/lib/agent/prompts";

import {
  cleanupAll,
  createFeature,
  createPage,
  createStack,
  createUser,
  createWorkspace,
  db,
} from "../factory";

/**
 * Extraction apply is idempotent (Step 54): re-running the same payload
 * proposes nothing new, reuses existing features by id and normalized name,
 * never touches CONFIRMED rows, and refuses to resurrect archived (rejected)
 * feature names.
 */
describe("applyExtraction — idempotent suggested-row upserts", () => {
  let workspaceId: string;
  let pageId: string;
  let stackId: string;
  let existingFeatureId: string;
  let result: ExtractionResult;

  beforeAll(async () => {
    const user = await createUser();
    const ws = await createWorkspace();
    workspaceId = ws.id;
    const stack = await createStack(ws.id);
    stackId = stack.id;
    const existing = await createFeature(ws.id, stack.id, {
      name: "Existing Feature",
      status: FeatureStatus.ACTIVE,
    });
    existingFeatureId = existing.id;
    // An archived feature whose name a proposal will try to re-introduce.
    await createFeature(ws.id, stack.id, {
      name: "Ghost Feature",
      archivedAt: new Date(),
    });
    const page = await createPage(ws.id, user.id, { contentText: "body" });
    pageId = page.id;

    result = {
      features: [
        {
          key: "existing",
          featureId: existingFeatureId,
          stackId: null,
          name: "Existing Feature",
          summary: "",
          role: PageFeatureRole.REFERENCES,
          confidence: 0.9,
        },
        {
          key: "fresh",
          featureId: null,
          stackId,
          name: "Brand New Feature",
          summary: "Proposed by extraction.",
          role: PageFeatureRole.DEFINES,
          confidence: 0.9,
        },
        {
          key: "ghost",
          featureId: null,
          stackId,
          name: "Ghost Feature", // matches an archived tombstone → dropped
          summary: "should be dropped",
          role: PageFeatureRole.REFERENCES,
          confidence: 0.9,
        },
      ],
      links: [
        {
          fromKey: "fresh",
          toKey: "existing",
          kind: FeatureLinkKind.CONSUMES,
          rationale: "fresh consumes existing",
          confidence: 0.9,
        },
      ],
    };
  });

  afterAll(cleanupAll);

  async function counts() {
    const [features, links, joins] = await Promise.all([
      db.feature.count({
        where: { workspaceId, status: FeatureStatus.SUGGESTED, archivedAt: null },
      }),
      db.featureLink.count({
        where: { workspaceId, status: SuggestionStatus.SUGGESTED },
      }),
      db.pageFeature.count({
        where: { pageId, status: SuggestionStatus.SUGGESTED },
      }),
    ]);
    return { features, links, joins };
  }

  it("first run creates suggestions, reuses the existing feature, drops the tombstone", async () => {
    const outcome = await applyExtraction(
      workspaceId,
      pageId,
      "Title",
      result,
    );
    expect(outcome.newFeatures).toBe(1); // only "Brand New Feature"
    expect(outcome.reusedFeatures).toBe(1); // "Existing Feature" by id
    expect(outcome.droppedItems).toBeGreaterThanOrEqual(1); // the ghost
    expect(outcome.newLinks).toBe(1);
    expect(outcome.newPageLinks).toBe(2); // existing + fresh roles

    const c = await counts();
    expect(c.features).toBe(1);
    expect(c.links).toBe(1);
    expect(c.joins).toBe(2);

    // The archived name was never re-created as a live feature.
    const ghosts = await db.feature.count({
      where: { workspaceId, name: "Ghost Feature", archivedAt: null },
    });
    expect(ghosts).toBe(0);
  });

  it("second run with the same payload creates nothing new", async () => {
    const before = await counts();
    const outcome = await applyExtraction(
      workspaceId,
      pageId,
      "Title",
      result,
    );
    expect(outcome.newFeatures).toBe(0);
    expect(outcome.newLinks).toBe(0);
    expect(outcome.newPageLinks).toBe(0);

    const after = await counts();
    expect(after).toEqual(before);
  });

  it("never downgrades a CONFIRMED row to SUGGESTED", async () => {
    // Confirm the extraction-proposed link, then re-run: it must stay CONFIRMED.
    await db.featureLink.updateMany({
      where: { workspaceId, status: SuggestionStatus.SUGGESTED },
      data: { status: SuggestionStatus.CONFIRMED },
    });
    await applyExtraction(workspaceId, pageId, "Title", result);
    const stillSuggested = await db.featureLink.count({
      where: { workspaceId, status: SuggestionStatus.SUGGESTED },
    });
    expect(stillSuggested).toBe(0);
  });
});
