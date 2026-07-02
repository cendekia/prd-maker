import { Role } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  addMember,
  cleanupAll,
  createPage,
  createUser,
  createWorkspace,
  db,
  docWithText,
  EMPTY_DOC,
} from "../factory";

// The action runs outside a request here: stub the auth/session resolution
// and Next's cache revalidation at the module boundary (loop.test.ts pattern).
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/workspace", () => ({ requireWorkspace: vi.fn() }));

import { requireWorkspace } from "@/lib/workspace";
import {
  publishTemplateAction,
} from "@/app/(authed)/[workspaceSlug]/settings/templates/actions";

const mockedRequire = vi.mocked(requireWorkspace);

function actAs(workspace: { id: string; slug: string }, role: Role) {
  mockedRequire.mockResolvedValue({
    workspace,
    member: { role },
  } as never);
}

/**
 * Step 61's publish-time capture guard + the snapshot-copy regression pair
 * behind the reported "template went blank after the base page was deleted".
 */
describe("publishTemplateAction (Step 61)", () => {
  afterAll(cleanupAll);
  beforeEach(() => mockedRequire.mockReset());

  async function setup() {
    const user = await createUser();
    const workspace = await createWorkspace();
    await addMember(workspace.id, user.id, Role.OWNER);
    return { workspace, user };
  }

  it("refuses a base page whose contentJson is null", async () => {
    const { workspace, user } = await setup();
    actAs(workspace, Role.OWNER);
    const page = await createPage(workspace.id, user.id);
    const res = await publishTemplateAction(workspace.slug, page.id, "T", "");
    expect(res.ok).toBe(false);
    expect(res.fieldErrors?.pageId).toMatch(/no saved content/);
    expect(await db.template.count({ where: { workspaceId: workspace.id } })).toBe(0);
  });

  it("refuses a whitespace-only doc", async () => {
    const { workspace, user } = await setup();
    actAs(workspace, Role.OWNER);
    const page = await createPage(workspace.id, user.id);
    await db.page.update({
      where: { id: page.id },
      data: { contentJson: EMPTY_DOC },
    });
    const res = await publishTemplateAction(workspace.slug, page.id, "T", "");
    expect(res.ok).toBe(false);
    expect(res.fieldErrors?.pageId).toMatch(/no saved content/);
  });

  it("copies content on publish and is OWNER-only", async () => {
    const { workspace, user } = await setup();
    const page = await createPage(workspace.id, user.id);
    await db.page.update({
      where: { id: page.id },
      data: { contentJson: docWithText("Capture", "Copied at publish.") },
    });

    actAs(workspace, Role.EDITOR);
    const denied = await publishTemplateAction(workspace.slug, page.id, "T", "");
    expect(denied.ok).toBe(false);
    expect(denied.error).toMatch(/Only owners/);

    actAs(workspace, Role.OWNER);
    const res = await publishTemplateAction(
      workspace.slug,
      page.id,
      "Captured",
      "desc",
    );
    expect(res.ok).toBe(true);
    const tpl = await db.template.findFirstOrThrow({
      where: { workspaceId: workspace.id, name: "Captured" },
    });
    expect(JSON.stringify(tpl.contentJson)).toContain("Copied at publish.");
  });

  it("regression: the template survives base-page archive AND hard delete", async () => {
    const { workspace, user } = await setup();
    actAs(workspace, Role.OWNER);
    const base = await createPage(workspace.id, user.id, { title: "Base" });
    await db.page.update({
      where: { id: base.id },
      data: { contentJson: docWithText("Survivor", "Outlives the base page.") },
    });
    const res = await publishTemplateAction(
      workspace.slug,
      base.id,
      "Survivor tpl",
      "",
    );
    expect(res.ok).toBe(true);
    const tpl = await db.template.findFirstOrThrow({
      where: { workspaceId: workspace.id, name: "Survivor tpl" },
    });

    // Archive the base page → template content untouched.
    await db.page.update({
      where: { id: base.id },
      data: { archivedAt: new Date() },
    });
    let fresh = await db.template.findUniqueOrThrow({ where: { id: tpl.id } });
    expect(JSON.stringify(fresh.contentJson)).toContain("Outlives the base page.");

    // Hard-delete the base page → template content still untouched.
    await db.page.delete({ where: { id: base.id } });
    fresh = await db.template.findUniqueOrThrow({ where: { id: tpl.id } });
    expect(JSON.stringify(fresh.contentJson)).toContain("Outlives the base page.");
  });
});
