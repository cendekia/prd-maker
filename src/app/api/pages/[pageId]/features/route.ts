import { NextResponse } from "next/server";
import { PageFeatureRole, Role } from "@prisma/client";

import { auth } from "@/auth";
import {
  listPageFeatures,
  removePageFeature,
  setPageFeature,
} from "@/lib/agent/features";
import { jsonError } from "@/lib/api";
import { requirePageAccess } from "@/lib/permissions";

interface Params {
  params: Promise<{ pageId: string }>;
}

function parseRole(v: unknown): PageFeatureRole | undefined {
  return typeof v === "string" &&
    (Object.values(PageFeatureRole) as string[]).includes(v)
    ? (v as PageFeatureRole)
    : undefined;
}

async function pageAccess(pageId: string, minimum: Role) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: jsonError("Unauthorized", 401) } as const;
  }
  try {
    const access = await requirePageAccess(pageId, session.user.id, minimum);
    return { access } as const;
  } catch {
    return { error: jsonError("Page not found", 404) } as const;
  }
}

export async function GET(_req: Request, { params }: Params) {
  const { pageId } = await params;
  const result = await pageAccess(pageId, Role.VIEWER);
  if ("error" in result) return result.error;

  const features = await listPageFeatures(pageId, result.access.workspaceId);
  return NextResponse.json({ features });
}

export async function POST(req: Request, { params }: Params) {
  const { pageId } = await params;
  const result = await pageAccess(pageId, Role.EDITOR);
  if ("error" in result) return result.error;

  let body: { featureId?: string; role?: string } = {};
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body");
  }
  const role = parseRole(body.role);
  if (typeof body.featureId !== "string" || !body.featureId || !role) {
    return jsonError("featureId and a valid role are required.");
  }

  try {
    const feature = await setPageFeature({
      workspaceId: result.access.workspaceId,
      actorRole: result.access.role,
      pageId,
      featureId: body.featureId,
      role,
    });
    return NextResponse.json({ feature }, { status: 201 });
  } catch (e) {
    return jsonError((e as Error).message, 400);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const { pageId } = await params;
  const result = await pageAccess(pageId, Role.EDITOR);
  if ("error" in result) return result.error;

  let body: { pageFeatureId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body");
  }
  if (typeof body.pageFeatureId !== "string" || !body.pageFeatureId) {
    return jsonError("pageFeatureId is required.");
  }

  try {
    await removePageFeature({
      workspaceId: result.access.workspaceId,
      actorRole: result.access.role,
      pageFeatureId: body.pageFeatureId,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError((e as Error).message, 400);
  }
}
