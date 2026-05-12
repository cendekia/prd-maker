import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { exportPageHtml } from "@/lib/export-html";
import { renderPageMarkdown } from "@/lib/export-markdown";
import { exportPagePdf } from "@/lib/export-pdf";
import { getPageAccess } from "@/lib/permissions";

interface Params {
  params: Promise<{ pageId: string; format: string }>;
}

type Format = "md" | "html" | "pdf";

const FORMATS: Record<Format, { mime: string; ext: string }> = {
  md: { mime: "text/markdown; charset=utf-8", ext: "md" },
  html: { mime: "text/html; charset=utf-8", ext: "html" },
  pdf: { mime: "application/pdf", ext: "pdf" },
};

/**
 * Node runtime: @react-pdf/renderer pulls in Buffer/Stream + native font
 * parsers that don't work in Next's edge runtime.
 */
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: Params) {
  const { pageId, format } = await params;
  if (!isFormat(format)) {
    return NextResponse.json({ error: "Unsupported format" }, { status: 400 });
  }
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const access = await getPageAccess(pageId, session.user.id);
  if (!access) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  const page = await db.page.findUnique({
    where: { id: pageId },
    select: {
      title: true,
      contentJson: true,
      updatedAt: true,
      archivedAt: true,
    },
  });
  if (!page || page.archivedAt) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  const { mime, ext } = FORMATS[format];
  const filename = `${slugifyFilename(page.title) || "page"}.${ext}`;
  const disposition = `attachment; filename="${filename}"`;

  if (format === "md") {
    const body = renderPageMarkdown(page.contentJson, page.title);
    return new NextResponse(body, {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": disposition,
      },
    });
  }

  if (format === "html") {
    const body = exportPageHtml({ title: page.title, doc: page.contentJson });
    return new NextResponse(body, {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": disposition,
      },
    });
  }

  // PDF
  const buffer = await exportPagePdf({
    title: page.title,
    doc: page.contentJson,
    updatedAt: page.updatedAt,
  });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": disposition,
      "Content-Length": String(buffer.byteLength),
    },
  });
}

function isFormat(s: string): s is Format {
  return s === "md" || s === "html" || s === "pdf";
}

function slugifyFilename(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
