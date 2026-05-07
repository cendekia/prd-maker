import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import { issueCollabToken } from "@/lib/collab-token";
import { getPageAccess } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pageId = req.nextUrl.searchParams.get("pageId");
  if (!pageId) {
    return NextResponse.json({ error: "Missing pageId" }, { status: 400 });
  }

  const access = await getPageAccess(pageId, session.user.id);
  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const issued = issueCollabToken({
    pageId,
    userId: session.user.id,
    role: access.role,
    name: session.user.name ?? session.user.email ?? "Anonymous",
  });

  return NextResponse.json(issued, {
    headers: {
      // The token is short-lived and scoped to one page+user; never cache.
      "Cache-Control": "no-store",
    },
  });
}
