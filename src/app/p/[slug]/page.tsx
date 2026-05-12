import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicDoc } from "@/components/public/public-doc";
import { db } from "@/lib/db";

import "./public.css";

interface PublicPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * SSR'd public page. Revalidation is triggered explicitly from the
 * publish/unpublish server actions via `revalidatePath('/p/:slug')`, so
 * we can cache aggressively while still showing edits the moment the
 * author re-publishes.
 */
export const revalidate = 3600;

async function loadPublicPage(slug: string) {
  const page = await db.page.findUnique({
    where: { publicSlug: slug },
    select: {
      id: true,
      title: true,
      contentJson: true,
      isPublished: true,
      archivedAt: true,
      updatedAt: true,
    },
  });
  if (!page || !page.isPublished || page.archivedAt) return null;
  return page;
}

export async function generateMetadata({
  params,
}: PublicPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await loadPublicPage(slug);
  if (!page) {
    return { title: "Not found" };
  }
  return {
    title: page.title,
    openGraph: { title: page.title, type: "article" },
  };
}

export default async function PublicPage({ params }: PublicPageProps) {
  const { slug } = await params;
  const page = await loadPublicPage(slug);
  if (!page) notFound();

  return (
    <article className="mx-auto w-full max-w-[760px] px-6 py-14">
      <header className="mb-8">
        <h1 className="text-[40px] font-semibold leading-[1.15] tracking-[-0.02em] text-fg-1">
          {page.title}
        </h1>
        <p className="mt-3 text-[12px] text-fg-3">
          Last updated{" "}
          {new Date(page.updatedAt).toLocaleDateString([], {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </p>
      </header>
      <div className="prdmaker-public-prose">
        <PublicDoc doc={page.contentJson} />
      </div>
    </article>
  );
}
