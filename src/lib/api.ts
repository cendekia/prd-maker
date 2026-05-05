import "server-only";

import { NextResponse } from "next/server";
import { Role } from "@prisma/client";

import { auth } from "@/auth";
import { db } from "@/lib/db";

export interface ApiContext {
  user: { id: string; email: string };
  workspace: { id: string; slug: string; name: string };
  member: { id: string; role: Role };
}

/**
 * Resolve the request's workspace context: authenticated user + membership.
 * Returns either an ApiContext or a NextResponse to short-circuit with.
 */
export async function getApiContext(
  workspaceId: string,
): Promise<ApiContext | NextResponse> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, slug: true, name: true },
  });
  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }
  const member = await db.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: session.user.id,
      },
    },
    select: { id: true, role: true },
  });
  if (!member) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return {
    user: { id: session.user.id, email: session.user.email },
    workspace,
    member,
  };
}

export function isResponse(x: unknown): x is NextResponse {
  return x instanceof NextResponse;
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
