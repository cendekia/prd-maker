import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { requireUser } from "@/lib/workspace";

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  return (
    <div className="min-h-screen bg-background text-fg-1">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[13px] text-fg-3 hover:text-fg-1"
        >
          <ArrowLeft className="size-3.5" />
          Back to app
        </Link>
        <h1 className="t-h2 mt-4">Account settings</h1>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
