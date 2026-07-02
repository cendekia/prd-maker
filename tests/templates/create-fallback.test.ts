import { Role } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

import { createPage as createPageService } from "@/lib/pages";

import {
  cleanupAll,
  createTemplate,
  createWorkspace,
  createWorkspaceWithOwner,
  db,
  docWithText,
} from "../factory";

/**
 * Step 61's graceful blank fallback + Step 57's templateId persistence in
 * `createPage` — including the tenancy hard-fail that is deliberately NOT a
 * fallback case.
 */
describe("createPage template handling (Steps 57 + 61)", () => {
  afterAll(cleanupAll);

  async function actor() {
    const { workspace, user } = await createWorkspaceWithOwner();
    return {
      workspaceId: workspace.id,
      actorId: user.id,
      actorRole: Role.OWNER,
    };
  }

  it("copies a workspace template and records templateId", async () => {
    const a = await actor();
    const tpl = await createTemplate(a.workspaceId, {
      contentJson: docWithText("Goals", "From template."),
    });
    const { page, templateMissing } = await createPageService({
      ...a,
      title: "From tpl",
      templateId: tpl.id,
    });
    expect(templateMissing).toBe(false);
    const row = await db.page.findUniqueOrThrow({
      where: { id: page.id },
      select: { templateId: true, contentJson: true },
    });
    expect(row.templateId).toBe(tpl.id);
    expect(JSON.stringify(row.contentJson)).toContain("From template.");
  });

  it("copies a system template (workspaceId null)", async () => {
    const a = await actor();
    const tpl = await createTemplate(null);
    const { page, templateMissing } = await createPageService({
      ...a,
      templateId: tpl.id,
    });
    expect(templateMissing).toBe(false);
    const row = await db.page.findUniqueOrThrow({
      where: { id: page.id },
      select: { templateId: true, contentJson: true },
    });
    expect(row.templateId).toBe(tpl.id);
    expect(row.contentJson).not.toBeNull();
  });

  it("falls back to a blank page when the template vanished", async () => {
    const a = await actor();
    const { page, templateMissing } = await createPageService({
      ...a,
      title: "Vanished",
      templateId: "does-not-exist",
    });
    expect(templateMissing).toBe(true);
    const row = await db.page.findUniqueOrThrow({
      where: { id: page.id },
      select: { templateId: true, contentJson: true },
    });
    expect(row.templateId).toBeNull();
    expect(row.contentJson).toBeNull();
  });

  it("still throws for another workspace's template — tenancy is never a fallback", async () => {
    const a = await actor();
    const other = await createWorkspace();
    const foreign = await createTemplate(other.id);
    await expect(
      createPageService({ ...a, title: "Cross", templateId: foreign.id }),
    ).rejects.toThrow("Template not found.");
    const count = await db.page.count({
      where: { workspaceId: a.workspaceId, title: "Cross" },
    });
    expect(count).toBe(0);
  });

  it("persists parentId and templateId together for child creates", async () => {
    const a = await actor();
    const tpl = await createTemplate(a.workspaceId);
    const { page: parent } = await createPageService({ ...a, title: "Parent" });
    const { page: child } = await createPageService({
      ...a,
      title: "Child",
      parentId: parent.id,
      templateId: tpl.id,
    });
    const row = await db.page.findUniqueOrThrow({
      where: { id: child.id },
      select: { parentId: true, templateId: true },
    });
    expect(row.parentId).toBe(parent.id);
    expect(row.templateId).toBe(tpl.id);
  });

  it("deleting the template SetNulls the pointer without touching the page", async () => {
    const a = await actor();
    const tpl = await createTemplate(a.workspaceId, {
      contentJson: docWithText("Keep me"),
    });
    const { page } = await createPageService({ ...a, templateId: tpl.id });
    await db.template.delete({ where: { id: tpl.id } });
    const row = await db.page.findUniqueOrThrow({
      where: { id: page.id },
      select: { templateId: true, contentJson: true },
    });
    expect(row.templateId).toBeNull();
    expect(JSON.stringify(row.contentJson)).toContain("Keep me");
  });
});
