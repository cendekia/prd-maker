import type { Metadata } from "next";

import {
  PricingTable,
  type PricingPlan,
} from "@/components/marketing/pricing-table";
import { PLAN_LIMITS, PLAN_NAMES, PLAN_PRICES_USD } from "@/lib/config";

const TITLE = "Pricing · PRD Maker";
const DESCRIPTION =
  "Simple per-seat pricing. Start free, then upgrade to Pro or Business for unlimited PRDs, public publishing, SSO, and more.";

export const metadata: Metadata = {
  title: "Pricing",
  description: DESCRIPTION,
  alternates: { canonical: "/pricing" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/pricing" },
  twitter: { title: TITLE, description: DESCRIPTION },
};

// Sourced from the same constants Stripe checkout (Step 24) and plan-gating
// (Step 25) use, so marketing copy can't drift from what's actually enforced.
const free = PLAN_LIMITS.FREE;

const PLANS: PricingPlan[] = [
  {
    id: "FREE",
    name: PLAN_NAMES.FREE,
    priceMonthly: PLAN_PRICES_USD.FREE.monthly,
    priceYearly: PLAN_PRICES_USD.FREE.yearly,
    tagline: "For individuals and small teams getting started.",
    ctaLabel: "Get started",
    features: [
      `Up to ${free.maxMembers} workspace members`,
      `Up to ${free.maxPages} PRDs`,
      `${free.versionHistoryDays}-day version history`,
      "AI assistant with your own key",
      "Real-time editing & comments",
    ],
  },
  {
    id: "PRO",
    name: PLAN_NAMES.PRO,
    priceMonthly: PLAN_PRICES_USD.PRO.monthly,
    priceYearly: PLAN_PRICES_USD.PRO.yearly,
    tagline: "For growing product teams writing specs every day.",
    highlighted: true,
    ctaLabel: "Get started",
    featuresHeading: "Everything in Free, plus",
    features: [
      "Unlimited members & PRDs",
      "Unlimited version history",
      "Publish to the public web",
      "Markdown, HTML & PDF export",
      "Priority email support",
    ],
  },
  {
    id: "BUSINESS",
    name: PLAN_NAMES.BUSINESS,
    priceMonthly: PLAN_PRICES_USD.BUSINESS.monthly,
    priceYearly: PLAN_PRICES_USD.BUSINESS.yearly,
    tagline: "For organizations that need control and compliance.",
    ctaLabel: "Get started",
    featuresHeading: "Everything in Pro, plus",
    features: [
      "Per-page permissions (ACLs)",
      "SSO / SAML single sign-on",
      "Audit log",
      "Custom domains",
      "Onboarding & priority support",
    ],
  },
];

export default function PricingPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <span className="t-label">Pricing</span>
        <h1 className="mt-3 text-[32px] font-semibold leading-[1.12] tracking-[-0.02em] text-fg-1 sm:text-[42px]">
          Simple, per-seat pricing
        </h1>
        <p className="mt-4 text-[15px] leading-[24px] text-fg-2">
          Start free, no credit card required. Upgrade when your team grows —
          and only pay for the seats you use.
        </p>
      </div>

      <div className="mt-12">
        <PricingTable plans={PLANS} />
      </div>

      <p className="mt-10 text-center text-[12px] text-fg-3">
        Prices in USD per seat. Annual plans are billed once yearly. Cancel or
        change your plan anytime from workspace settings.
      </p>
    </div>
  );
}
