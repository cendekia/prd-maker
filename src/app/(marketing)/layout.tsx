import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { APP_URL } from "@/lib/config";

const DESCRIPTION =
  "A Confluence-style PRD editor with real-time multiplayer, version history, and a built-in AI assistant that drafts and critiques specs — using your own API key.";

/**
 * Marketing-wide metadata. `metadataBase` makes the file-convention
 * OpenGraph image (./opengraph-image.tsx) resolve to an absolute URL, and the
 * title template lets nested pages set just their bare title (e.g. "Pricing").
 * Twitter falls back to the OG image when only `card` is set.
 */
export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "PRD Maker — Collaborative PRDs with a built-in AI assistant",
    template: "%s · PRD Maker",
  },
  description: DESCRIPTION,
  applicationName: "PRD Maker",
  openGraph: {
    type: "website",
    siteName: "PRD Maker",
    url: "/",
    title: "PRD Maker — Collaborative PRDs with a built-in AI assistant",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "PRD Maker — Collaborative PRDs with a built-in AI assistant",
    description: DESCRIPTION,
  },
};

const NAV_LINKS = [
  { href: "/pricing", label: "Pricing" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-fg-1">
      <header className="sticky top-0 z-[var(--z-sticky)] border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link href="/" className="flex items-center" aria-label="PRD Maker home">
            <Logo variant="wordmark" size={24} />
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <Button key={link.href} asChild variant="ghost" size="sm">
                <Link href={link.href}>{link.label}</Link>
              </Button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle className="hidden sm:inline-flex" />
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/sign-in">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border/70">
        <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8">
          <div className="flex flex-col justify-between gap-8 sm:flex-row">
            <div className="max-w-xs">
              <Logo variant="wordmark" size={22} />
              <p className="mt-3 text-[13px] leading-[20px] text-fg-3">
                Where product teams write PRDs together — with an AI that knows
                the spec.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-10 sm:gap-16">
              <div>
                <h2 className="t-label mb-3">Product</h2>
                <ul className="space-y-2 text-[13px]">
                  <li>
                    <Link href="/pricing" className="text-fg-2 hover:text-fg-1">
                      Pricing
                    </Link>
                  </li>
                  <li>
                    <Link href="/sign-in" className="text-fg-2 hover:text-fg-1">
                      Sign in
                    </Link>
                  </li>
                  <li>
                    <Link href="/sign-in" className="text-fg-2 hover:text-fg-1">
                      Get started
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <h2 className="t-label mb-3">Legal</h2>
                <ul className="space-y-2 text-[13px]">
                  <li>
                    <Link href="/privacy" className="text-fg-2 hover:text-fg-1">
                      Privacy
                    </Link>
                  </li>
                  <li>
                    <Link href="/terms" className="text-fg-2 hover:text-fg-1">
                      Terms
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-border/70 pt-6 sm:flex-row sm:items-center">
            <p className="text-[12px] text-fg-3">
              © {new Date().getFullYear()} PRD Maker. All rights reserved.
            </p>
            <ThemeToggle variant="full" />
          </div>
        </div>
      </footer>
    </div>
  );
}
