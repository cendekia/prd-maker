import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { FeatureGrid } from "@/components/marketing/feature-grid";
import { Hero } from "@/components/marketing/hero";
import { Button } from "@/components/ui/button";
import { getSession, listUserWorkspaces } from "@/lib/workspace";

export default async function MarketingHome() {
  // Signed-in users skip the marketing page and land in their workspace.
  const session = await getSession();
  if (session?.user?.id) {
    const workspaces = await listUserWorkspaces(session.user.id);
    if (workspaces.length > 0) {
      redirect(`/${workspaces[0].workspace.slug}`);
    }
    redirect("/onboarding");
  }

  return (
    <>
      <Hero />
      <FeatureGrid />

      <section className="mx-auto w-full max-w-6xl px-5 pb-24 sm:px-8">
        <div
          className="relative overflow-hidden rounded-[var(--radius-2xl)] border border-border bg-bg-subtle px-6 py-14 text-center sm:px-16 sm:py-20"
          style={{
            backgroundImage:
              "radial-gradient(80% 120% at 50% 0%, var(--accent-100), transparent)",
          }}
        >
          <h2 className="mx-auto max-w-xl text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] text-fg-1 sm:text-[32px]">
            Start writing your next PRD today
          </h2>
          <p className="mx-auto mt-3 max-w-md text-[15px] leading-[24px] text-fg-2">
            Create a workspace in seconds. Invite your team, draft with AI, and
            ship specs everyone can follow.
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/sign-in">
                Get started — it&apos;s free
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/pricing">Compare plans</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
