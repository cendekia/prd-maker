import { Role } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  addMember,
  cleanupAll,
  createPage,
  createTemplate,
  createUser,
  createWorkspace,
  db,
  docWithText,
} from "../factory";

// Route-level test: stub NextAuth's `auth()` so the handler runs against the
// test DB with a chosen session (the loop.test.ts module-boundary pattern).
vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import { POST } from "@/app/api/pages/[pageId]/apply-template/route";

const mockedAuth = vi.mocked(auth);

function signIn(userId: string | null) {
  mockedAuth.mockResolvedValue(
    (userId ? { user: { id: userId } } : null) as never,
  );
}

function post(pageId: string, body: unknown) {
  return POST(
    new Request("http://test/api/pages/apply-template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ pageId }) },
  );
}

/**
 * Step 62's apply-template gates. Note: the MANUAL snapshot happens
 * client-side after the plant (mirroring the AI-apply split), so the route's
 * contract is gates + `templateId` + returning the template content — it
 * never writes page content.
 */
describe("POST /api/pages/[pageId]/apply-template (Step 62)", () => {
  afterAll(cleanupAll);
  beforeEach(() => mockedAuth.mockReset());

  async function setup(role: Role = Role.OWNER) {
    const user = await createUser();
    const workspace = await createWorkspace();
    await addMember(workspace.id, user.id, role);
    const page = await createPage(workspace.id, user.id);
    const template = await createTemplate(workspace.id, {
      contentJson: docWithText("Applied", "Template body."),
    });
    return { user, workspace, page, template };
  }

  it("401 when unauthenticated", async () => {
    const { page, template } = await setup();
    signIn(null);
    const res = await post(page.id, { templateId: template.id });
    expect(res.status).toBe(401);
  });

  it("403 for viewers", async () => {
    const { user, page, template } = await setup(Role.VIEWER);
    signIn(user.id);
    const res = await post(page.id, { templateId: template.id });
    expect(res.status).toBe(403);
  });

  it("400 without a templateId", async () => {
    const { user, page } = await setup();
    signIn(user.id);
    const res = await post(page.id, {});
    expect(res.status).toBe(400);
  });

  it("applies to an empty page: sets templateId, returns content, writes none", async () => {
    const { user, page, template } = await setup();
    signIn(user.id);
    const res = await post(page.id, { templateId: template.id });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      ok: boolean;
      template: { id: string; name: string; contentJson: unknown };
    };
    expect(data.ok).toBe(true);
    expect(data.template.id).toBe(template.id);
    expect(JSON.stringify(data.template.contentJson)).toContain("Template body.");

    const row = await db.page.findUniqueOrThrow({
      where: { id: page.id },
      select: { templateId: true, contentJson: true },
    });
    expect(row.templateId).toBe(template.id);
    // The server never writes page content — the client plants it.
    expect(row.contentJson).toBeNull();
  });

  it("409 when the saved content is non-empty; templateId untouched", async () => {
    const { user, page, template } = await setup();
    await db.page.update({
      where: { id: page.id },
      data: { contentJson: docWithText("Existing") },
    });
    signIn(user.id);
    const res = await post(page.id, { templateId: template.id });
    expect(res.status).toBe(409);
    const row = await db.page.findUniqueOrThrow({
      where: { id: page.id },
      select: { templateId: true },
    });
    expect(row.templateId).toBeNull();
  });

  it("trusts the live doc over stale saved content (collab lag)", async () => {
    // In collab mode Page.contentJson lags the live doc (Hocuspocus persists
    // only yDocState; autosave is solo-only). A user who deleted everything
    // has an empty live doc while the saved projection still holds the old
    // content — the client's currentJson is the authority, like /api/ai/apply.
    const { user, page, template } = await setup();
    await db.page.update({
      where: { id: page.id },
      data: { contentJson: docWithText("Stale saved content") },
    });
    signIn(user.id);
    const res = await post(page.id, {
      templateId: template.id,
      currentJson: { type: "doc", content: [{ type: "paragraph" }] },
    });
    expect(res.status).toBe(200);
    const row = await db.page.findUniqueOrThrow({
      where: { id: page.id },
      select: { templateId: true, contentJson: true },
    });
    expect(row.templateId).toBe(template.id);
    // Server still writes no page content.
    expect(JSON.stringify(row.contentJson)).toContain("Stale saved content");
  });

  it("409 when the live doc is non-empty, even if saved content is empty", async () => {
    const { user, page, template } = await setup();
    signIn(user.id);
    const res = await post(page.id, {
      templateId: template.id,
      currentJson: docWithText("Live content"),
    });
    expect(res.status).toBe(409);
    const row = await db.page.findUniqueOrThrow({
      where: { id: page.id },
      select: { templateId: true },
    });
    expect(row.templateId).toBeNull();
  });

  it("404 for a missing or cross-workspace template", async () => {
    const { user, page } = await setup();
    signIn(user.id);
    expect((await post(page.id, { templateId: "nope" })).status).toBe(404);

    const other = await createWorkspace();
    const foreign = await createTemplate(other.id);
    expect((await post(page.id, { templateId: foreign.id })).status).toBe(404);

    const row = await db.page.findUniqueOrThrow({
      where: { id: page.id },
      select: { templateId: true },
    });
    expect(row.templateId).toBeNull();
  });

  it("accepts system templates (workspaceId null)", async () => {
    const { user, page } = await setup();
    const sys = await createTemplate(null);
    signIn(user.id);
    const res = await post(page.id, { templateId: sys.id });
    expect(res.status).toBe(200);
    const row = await db.page.findUniqueOrThrow({
      where: { id: page.id },
      select: { templateId: true },
    });
    expect(row.templateId).toBe(sys.id);
  });

  it("404 for a page in a workspace the user isn't a member of", async () => {
    const { page, template } = await setup();
    const outsider = await createUser();
    signIn(outsider.id);
    const res = await post(page.id, { templateId: template.id });
    expect(res.status).toBe(404);
  });
});
