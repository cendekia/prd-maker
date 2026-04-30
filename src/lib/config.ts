import { env } from "@/env";

export const APP_URL = env.NEXT_PUBLIC_APP_URL;

export const PUBLIC_PAGE_PATH_PREFIX = "/p";

export const PLANS = ["FREE", "PRO", "BUSINESS"] as const;
export type Plan = (typeof PLANS)[number];

/**
 * Plan limits and feature gates. Used by `src/lib/plan-gate.ts` (Step 25) to
 * enforce on every restricted action. `Infinity` means unlimited.
 */
export const PLAN_LIMITS: Record<
  Plan,
  {
    maxWorkspacesPerOwner: number;
    maxMembers: number;
    maxPages: number;
    versionHistoryDays: number;
    publicPublishing: boolean;
    customDomains: boolean;
    perPageAcls: boolean;
    sso: boolean;
    auditLog: boolean;
    aiPanel: boolean;
  }
> = {
  FREE: {
    maxWorkspacesPerOwner: 1,
    maxMembers: 3,
    maxPages: 10,
    versionHistoryDays: 7,
    publicPublishing: false,
    customDomains: false,
    perPageAcls: false,
    sso: false,
    auditLog: false,
    aiPanel: true,
  },
  PRO: {
    maxWorkspacesPerOwner: Infinity,
    maxMembers: Infinity,
    maxPages: Infinity,
    versionHistoryDays: Infinity,
    publicPublishing: true,
    customDomains: false,
    perPageAcls: false,
    sso: false,
    auditLog: false,
    aiPanel: true,
  },
  BUSINESS: {
    maxWorkspacesPerOwner: Infinity,
    maxMembers: Infinity,
    maxPages: Infinity,
    versionHistoryDays: Infinity,
    publicPublishing: true,
    customDomains: true,
    perPageAcls: true,
    sso: true,
    auditLog: true,
    aiPanel: true,
  },
};

export const PLAN_PRICES_USD = {
  FREE: { monthly: 0, yearly: 0 },
  PRO: { monthly: 15, yearly: 12 },
  BUSINESS: { monthly: 25, yearly: 20 },
} as const;

export const PLAN_NAMES: Record<Plan, string> = {
  FREE: "Free",
  PRO: "Pro",
  BUSINESS: "Business",
};

export const ROLES = ["OWNER", "EDITOR", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

/** Role rank — higher number = more permissions. */
export const ROLE_RANK: Record<Role, number> = {
  VIEWER: 1,
  EDITOR: 2,
  OWNER: 3,
};

export const isProd = env.NODE_ENV === "production";
export const isDev = env.NODE_ENV === "development";
export const isTest = env.NODE_ENV === "test";
