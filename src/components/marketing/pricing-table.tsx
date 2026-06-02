"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PricingPlan {
  id: string;
  name: string;
  /** Per-seat USD price when billed monthly. 0 = free. */
  priceMonthly: number;
  /** Per-seat USD price per month when billed annually. 0 = free. */
  priceYearly: number;
  tagline: string;
  featuresHeading?: string;
  features: string[];
  highlighted?: boolean;
  ctaLabel: string;
}

type Billing = "monthly" | "yearly";

export function PricingTable({ plans }: { plans: PricingPlan[] }) {
  const [billing, setBilling] = useState<Billing>("monthly");

  // Largest annual discount across paid plans, for the toggle's "Save X%" pill.
  const savingsPct = Math.max(
    0,
    ...plans
      .filter((p) => p.priceMonthly > 0)
      .map((p) => Math.round((1 - p.priceYearly / p.priceMonthly) * 100)),
  );

  return (
    <div>
      <div className="flex items-center justify-center gap-3">
        <div
          role="radiogroup"
          aria-label="Billing interval"
          className="inline-flex items-center gap-px rounded-[var(--radius-md)] border bg-bg-subtle p-0.5"
        >
          {(["monthly", "yearly"] as const).map((value) => {
            const active = billing === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setBilling(value)}
                className={cn(
                  "rounded-[var(--radius-sm)] px-3 py-1 text-[13px] font-medium transition-colors",
                  active
                    ? "bg-background text-fg-1 shadow-[var(--shadow-xs)]"
                    : "text-fg-3 hover:text-fg-1",
                )}
              >
                {value === "monthly" ? "Monthly" : "Annual"}
              </button>
            );
          })}
        </div>
        {savingsPct > 0 ? (
          <span className="rounded-[var(--radius-full)] bg-brand-50 px-2.5 py-1 text-[12px] font-medium text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
            Save {savingsPct}%
          </span>
        ) : null}
      </div>

      <div className="mt-10 grid items-start gap-5 lg:grid-cols-3">
        {plans.map((plan) => {
          const price = billing === "monthly" ? plan.priceMonthly : plan.priceYearly;
          const isFree = plan.priceMonthly === 0 && plan.priceYearly === 0;
          return (
            <div
              key={plan.id}
              className={cn(
                "relative flex flex-col rounded-[var(--radius-2xl)] border bg-background p-6",
                plan.highlighted
                  ? "border-brand-300 shadow-[var(--shadow-lg)]"
                  : "border-border",
              )}
            >
              {plan.highlighted ? (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-[var(--radius-full)] bg-brand-500 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-white">
                  Most popular
                </span>
              ) : null}

              <h3 className="text-[16px] font-semibold text-fg-1">{plan.name}</h3>
              <p className="mt-1 min-h-[40px] text-[13px] leading-[20px] text-fg-3">
                {plan.tagline}
              </p>

              <div className="mt-5 flex items-baseline gap-1">
                <span className="text-[40px] font-semibold leading-none tracking-[-0.02em] text-fg-1">
                  ${price}
                </span>
                {!isFree ? (
                  <span className="text-[13px] text-fg-3">/seat/mo</span>
                ) : null}
              </div>
              <p className="mt-1.5 text-[12px] text-fg-3">
                {isFree
                  ? "Free forever"
                  : billing === "yearly"
                    ? "billed annually"
                    : "billed monthly"}
              </p>

              <Button
                asChild
                size="lg"
                variant={plan.highlighted ? "default" : "outline"}
                className="mt-6 w-full"
              >
                <Link href="/sign-in">{plan.ctaLabel}</Link>
              </Button>

              {plan.featuresHeading ? (
                <p className="mt-7 text-[12px] font-medium text-fg-2">
                  {plan.featuresHeading}
                </p>
              ) : (
                <p className="mt-7 text-[12px] font-medium text-fg-2">
                  Includes
                </p>
              )}
              <ul className="mt-3 space-y-2.5">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2 text-[13px] leading-[20px] text-fg-2"
                  >
                    <Check className="mt-0.5 size-4 shrink-0 text-brand-500" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
