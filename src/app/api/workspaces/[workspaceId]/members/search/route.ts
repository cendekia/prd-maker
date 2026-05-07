import { NextRequest, NextResponse } from "next/server";

import { getApiContext, isResponse } from "@/lib/api";
import { db } from "@/lib/db";

interface Params {
  params: Promise<{ workspaceId: string }>;
}

/**
 * Search workspace members for @mention suggestions. Matches name and email,
 * case-insensitive, prefix-leaning. Caller must be a member of the workspace.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const { workspaceId } = await params;
  const ctx = await getApiContext(workspaceId);
  if (isResponse(ctx)) return ctx;

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const limit = Math.max(1, Math.min(20, Number(req.nextUrl.searchParams.get("limit") ?? 8)));

  const where = q
    ? {
        workspaceId,
        OR: [
          { user: { name: { contains: q, mode: "insensitive" as const } } },
          { user: { email: { contains: q, mode: "insensitive" as const } } },
        ],
      }
    : { workspaceId };

  const members = await db.workspaceMember.findMany({
    where,
    take: limit,
    orderBy: [{ user: { name: "asc" } }, { user: { email: "asc" } }],
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
    },
  });

  return NextResponse.json({
    results: members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      image: m.user.image,
      role: m.role,
    })),
  });
}
