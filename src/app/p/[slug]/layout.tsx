import Link from "next/link";

import { Logo } from "@/components/logo";

/**
 * Minimal chrome for the public read-only surface. No workspace switcher,
 * no sidebar, no auth — just a thin top strip and a centered prose column.
 */
export default function PublicPageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-fg-1">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-[760px] items-center justify-between px-5 sm:px-6 py-3">
          <Link href="/" className="flex items-center gap-2 text-[13px] text-fg-3 hover:text-fg-1">
            <Logo variant="mark" size={20} />
            <span className="font-medium">PRDMaker</span>
          </Link>
          <Link
            href="/sign-in"
            className="text-[12px] text-fg-3 hover:text-fg-1"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-[760px] items-center justify-between px-5 sm:px-6 py-4 text-[11px] text-fg-3">
          <span>
            Made with{" "}
            <Link href="/" className="text-fg-2 hover:text-fg-1 underline-offset-2 hover:underline">
              PRDMaker
            </Link>
          </span>
          <Link href="/privacy" className="hover:text-fg-2">
            Privacy
          </Link>
        </div>
      </footer>
    </div>
  );
}
