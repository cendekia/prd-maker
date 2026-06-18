import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildWorkspaceContext } from "@/lib/agent/context";

import {
  cleanupAll,
  createFeature,
  createStack,
  createWorkspace,
} from "../factory";

/**
 * Workspace-context budget truncation (Step 54). A catalog larger than the
 * budget must trim per stack, stay parseable, and point the model at tools
 * for the rest — while the unbounded render carries every feature + its id.
 */
describe("buildWorkspaceContext — budget truncation", () => {
  let workspaceId: string;
  const names: string[] = [];

  beforeAll(async () => {
    const ws = await createWorkspace();
    workspaceId = ws.id;
    const stack = await createStack(ws.id, { name: "Backend" });
    // Many features with long summaries → a large full render.
    for (let i = 0; i < 12; i++) {
      const name = `Feature Number ${i}`;
      names.push(name);
      await createFeature(ws.id, stack.id, {
        name,
        summary:
          "A deliberately long one-line summary so the catalog comfortably exceeds a small character budget when rendered in full. ".repeat(
            2,
          ),
      });
    }
  });

  afterAll(cleanupAll);

  it("full render includes every feature name and the stack header", async () => {
    const full = await buildWorkspaceContext(workspaceId, 100_000);
    expect(full).toContain("# Application map");
    expect(full).toContain("## Backend");
    for (const name of names) expect(full).toContain(name);
    expect(full).not.toContain("truncated to fit");
  });

  it("small budget truncates, stays shorter, and points at tools", async () => {
    const full = await buildWorkspaceContext(workspaceId, 100_000);
    const small = await buildWorkspaceContext(workspaceId, 600);
    expect(small.length).toBeLessThan(full.length);
    // The truncation surfaces the per-stack "call list_features" affordance.
    expect(small).toMatch(/list_features/);
    // Still readable: the header survives.
    expect(small).toContain("# Application map");
  });
});
