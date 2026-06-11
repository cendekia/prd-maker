import {
  AgentOrigin,
  FeatureLinkKind,
  FeatureStatus,
  ImpactRunStatus,
  PageFeatureRole,
  StackType,
  SuggestionStatus,
} from "@prisma/client";

/**
 * Single source of truth for workspace-agent presentation and transport
 * types (ai_development_plan.md Step 44): ordered enum values, human labels,
 * accent colors (CSS variables from globals.css), the shapes the feature-graph
 * APIs serve to the client, and the ImpactReport JSON contract persisted on
 * `ImpactAnalysis.report`. Mirrors src/lib/agile.ts — colors are token
 * references so they track light/dark.
 */

/* ------------------------------ Stacks --------------------------------- */

/** Picker order for stack types. */
export const STACK_TYPE_ORDER: StackType[] = [
  StackType.FRONTEND,
  StackType.BACKEND,
  StackType.API,
  StackType.WEBSOCKET,
  StackType.EMAIL,
  StackType.MOBILE,
  StackType.INFRA,
  StackType.OTHER,
];

export const STACK_TYPE_LABELS: Record<StackType, string> = {
  FRONTEND: "Frontend",
  BACKEND: "Backend",
  API: "API",
  WEBSOCKET: "WebSocket",
  EMAIL: "Email UI",
  MOBILE: "Mobile",
  INFRA: "Infrastructure",
  OTHER: "Other",
};

/** Compact badge text for chips and mind-map nodes. */
export const STACK_TYPE_BADGES: Record<StackType, string> = {
  FRONTEND: "FE",
  BACKEND: "BE",
  API: "API",
  WEBSOCKET: "WS",
  EMAIL: "EMAIL",
  MOBILE: "MOBILE",
  INFRA: "INFRA",
  OTHER: "OTHER",
};

/** Palette offered when creating/recoloring a stack (Step 45). */
export const STACK_COLOR_PALETTE = [
  "#5333D8", // indigo (brand)
  "#0EA5E9", // sky
  "#10B981", // emerald
  "#F59E0B", // amber
  "#EF4444", // red
  "#EC4899", // pink
  "#8B5CF6", // violet
  "#64748B", // slate
] as const;

export const DEFAULT_STACK_COLOR = STACK_COLOR_PALETTE[0];

/* --------------------------- Feature status ---------------------------- */

export const FEATURE_STATUS_ORDER: FeatureStatus[] = [
  FeatureStatus.SUGGESTED,
  FeatureStatus.ACTIVE,
  FeatureStatus.DEPRECATED,
];

export const FEATURE_STATUS_LABELS: Record<FeatureStatus, string> = {
  SUGGESTED: "Suggested",
  ACTIVE: "Active",
  DEPRECATED: "Deprecated",
};

export const FEATURE_STATUS_COLORS: Record<FeatureStatus, string> = {
  SUGGESTED: "var(--warning-500)",
  ACTIVE: "var(--success-500)",
  DEPRECATED: "var(--fg-4)",
};

/* -------------------------- Suggestion status -------------------------- */

export const SUGGESTION_STATUS_ORDER: SuggestionStatus[] = [
  SuggestionStatus.SUGGESTED,
  SuggestionStatus.CONFIRMED,
  SuggestionStatus.REJECTED,
];

export const SUGGESTION_STATUS_LABELS: Record<SuggestionStatus, string> = {
  SUGGESTED: "Suggested",
  CONFIRMED: "Confirmed",
  REJECTED: "Rejected",
};

export const SUGGESTION_STATUS_COLORS: Record<SuggestionStatus, string> = {
  SUGGESTED: "var(--warning-500)",
  CONFIRMED: "var(--success-500)",
  REJECTED: "var(--fg-4)",
};

/* -------------------------------- Origin ------------------------------- */

export const AGENT_ORIGIN_LABELS: Record<AgentOrigin, string> = {
  AGENT: "Agent",
  MANUAL: "Manual",
};

/* ------------------------------ Link kinds ----------------------------- */

export const FEATURE_LINK_KIND_ORDER: FeatureLinkKind[] = [
  FeatureLinkKind.DEPENDS_ON,
  FeatureLinkKind.CONSUMES,
  FeatureLinkKind.TRIGGERS,
  FeatureLinkKind.EXTENDS,
  FeatureLinkKind.IMPACTS,
  FeatureLinkKind.RELATES_TO,
];

export const FEATURE_LINK_KIND_LABELS: Record<FeatureLinkKind, string> = {
  DEPENDS_ON: "Depends on",
  CONSUMES: "Consumes",
  TRIGGERS: "Triggers",
  EXTENDS: "Extends",
  IMPACTS: "Impacts",
  RELATES_TO: "Relates to",
};

/**
 * One-line semantics per kind — shown in the link picker and embedded in the
 * agent's extraction/impact prompts (Step 47) so the model uses kinds the
 * same way humans do.
 */
export const FEATURE_LINK_KIND_DESCRIPTIONS: Record<FeatureLinkKind, string> = {
  DEPENDS_ON: "Needs the target feature to function at all",
  CONSUMES: "Calls or reads the target (API endpoint, data, socket event)",
  TRIGGERS: "Causes the target to run (event, email, background job)",
  EXTENDS: "Builds on top of the target's behavior",
  IMPACTS: "Changes the target's behavior as a side effect",
  RELATES_TO: "Loosely related — no hard dependency",
};

/** Edge accents on the mind map (Step 51). */
export const FEATURE_LINK_KIND_COLORS: Record<FeatureLinkKind, string> = {
  DEPENDS_ON: "var(--danger-500)",
  CONSUMES: "var(--info-500)",
  TRIGGERS: "var(--warning-500)",
  EXTENDS: "var(--success-500)",
  IMPACTS: "var(--fg-3)",
  RELATES_TO: "var(--fg-4)",
};

/* --------------------------- PRD ↔ feature roles ------------------------ */

export const PAGE_FEATURE_ROLE_ORDER: PageFeatureRole[] = [
  PageFeatureRole.DEFINES,
  PageFeatureRole.MODIFIES,
  PageFeatureRole.REFERENCES,
];

export const PAGE_FEATURE_ROLE_LABELS: Record<PageFeatureRole, string> = {
  DEFINES: "Defines",
  MODIFIES: "Modifies",
  REFERENCES: "References",
};

export const PAGE_FEATURE_ROLE_DESCRIPTIONS: Record<PageFeatureRole, string> =
  {
    DEFINES: "This PRD specifies the feature",
    MODIFIES: "Change request — this PRD changes an existing feature",
    REFERENCES: "This PRD mentions or builds near the feature",
  };

export const PAGE_FEATURE_ROLE_COLORS: Record<PageFeatureRole, string> = {
  DEFINES: "var(--success-500)",
  MODIFIES: "var(--warning-500)",
  REFERENCES: "var(--fg-3)",
};

/* ----------------------- Impact severity & kind ------------------------- */
// Not Prisma enums — these live inside the ImpactReport JSON. The arrays
// double as z.enum() inputs for the report parser (Step 47).

export const IMPACT_SEVERITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export type ImpactSeverity = (typeof IMPACT_SEVERITIES)[number];

export const IMPACT_SEVERITY_LABELS: Record<ImpactSeverity, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

export const IMPACT_SEVERITY_COLORS: Record<ImpactSeverity, string> = {
  LOW: "var(--fg-3)",
  MEDIUM: "var(--warning-500)",
  HIGH: "var(--danger-500)",
};

export const IMPACT_KINDS = [
  "CONTRACT",
  "BEHAVIOR",
  "DATA",
  "UX",
  "OTHER",
] as const;
export type ImpactKind = (typeof IMPACT_KINDS)[number];

export const IMPACT_KIND_LABELS: Record<ImpactKind, string> = {
  CONTRACT: "API contract",
  BEHAVIOR: "Behavior",
  DATA: "Data / schema",
  UX: "UX",
  OTHER: "Other",
};

export const IMPACT_KIND_DESCRIPTIONS: Record<ImpactKind, string> = {
  CONTRACT: "Request/response or event shape changes for consumers",
  BEHAVIOR: "Existing behavior changes without an interface change",
  DATA: "Stored data, schema, or migration impact",
  UX: "User-facing flow or UI impact",
  OTHER: "Anything else worth flagging",
};

/* ------------------------------- Unions -------------------------------- */

/** String-literal unions for zod validation and props (e.g. `"CONSUMES"`). */
export type StackTypeValue = `${StackType}`;
export type FeatureStatusValue = `${FeatureStatus}`;
export type AgentOriginValue = `${AgentOrigin}`;
export type FeatureLinkKindValue = `${FeatureLinkKind}`;
export type SuggestionStatusValue = `${SuggestionStatus}`;
export type PageFeatureRoleValue = `${PageFeatureRole}`;
export type ImpactRunStatusValue = `${ImpactRunStatus}`;

/* --------------------------- Transport types ---------------------------- */

/** A stack as served to settings, the Features surface, and the map. */
export interface StackSummary {
  id: string;
  name: string;
  type: StackType;
  description: string | null;
  color: string;
  position: number;
  /** Features owned by this stack (excluding archived). */
  featureCount: number;
}

/** Mind-map node — a feature as served to the list, detail sheet, and map. */
export interface FeatureNode {
  id: string;
  stackId: string;
  name: string;
  summary: string;
  status: FeatureStatus;
  origin: AgentOrigin;
  archivedAt: string | null;
  /** PRDs joined to this feature via PageFeature (excluding archived pages). */
  pageCount: number;
}

/** Mind-map edge — a typed feature link as served to the client. */
export interface FeatureEdge {
  id: string;
  fromFeatureId: string;
  toFeatureId: string;
  kind: FeatureLinkKind;
  status: SuggestionStatus;
  origin: AgentOrigin;
  confidence: number | null;
  rationale: string | null;
}

/** The whole workspace graph — payload of the Features surface and map. */
export interface WorkspaceGraph {
  stacks: StackSummary[];
  features: FeatureNode[];
  links: FeatureEdge[];
}

/** Minimal endpoint info for rendering a link row's far side. */
export interface FeatureLinkEndpoint {
  id: string;
  name: string;
  stackId: string;
}

/** A link with both endpoints resolved — served by the feature-detail API. */
export interface FeatureDetailLink extends FeatureEdge {
  fromFeature: FeatureLinkEndpoint;
  toFeature: FeatureLinkEndpoint;
}

/** Payload of GET /features/[featureId] (detail sheet, Step 46). */
export interface FeatureDetail {
  feature: FeatureNode;
  links: FeatureDetailLink[];
  pages: FeaturePageRef[];
}

/** A PRD as attached to a feature (feature detail sheet, Step 46). */
export interface FeaturePageRef {
  /** PageFeature row id (needed for role changes / detach). */
  id: string;
  pageId: string;
  title: string;
  role: PageFeatureRole;
  status: SuggestionStatus;
  origin: AgentOrigin;
}

/** A feature as attached to a PRD (properties-bar Features field, Step 52). */
export interface PageFeatureItem {
  /** PageFeature row id (needed for role changes / detach). */
  id: string;
  featureId: string;
  name: string;
  stackId: string;
  stackName: string;
  stackColor: string;
  role: PageFeatureRole;
  status: SuggestionStatus;
  origin: AgentOrigin;
}

/* --------------------------- Impact report ------------------------------ */

/**
 * Reference to a feature in an impact report — by id when it exists in the
 * graph, by name only (featureId null) when the report proposes a new one.
 */
export interface ImpactFeatureRef {
  featureId: string | null;
  name: string;
}

/** One existing feature the analyzed PRD touches. */
export interface ImpactedFeature {
  featureId: string;
  /** Name echoed at analysis time so the card stays renderable even if the
   *  feature is later renamed or removed. */
  name: string;
  severity: ImpactSeverity;
  kind: ImpactKind;
  rationale: string;
}

/** A new graph edge the report proposes (feeds the Step 50 review queue). */
export interface SuggestedImpactLink {
  from: ImpactFeatureRef;
  to: ImpactFeatureRef;
  kind: FeatureLinkKindValue;
  rationale: string;
}

/**
 * JSON contract persisted in `ImpactAnalysis.report` (Step 52) and produced
 * by the impact prompt (Step 47). The zod parser in src/lib/agent/prompts.ts
 * must `satisfies z.ZodType<ImpactReport>` so the two can't drift.
 */
export interface ImpactReport {
  /** Two–three sentence executive summary of the change's blast radius. */
  summary: string;
  impactedFeatures: ImpactedFeature[];
  suggestedLinks: SuggestedImpactLink[];
  /** Cross-stack contract notes, e.g. "API response shape change → FE consumer". */
  contractNotes: string[];
  openQuestions: string[];
}
