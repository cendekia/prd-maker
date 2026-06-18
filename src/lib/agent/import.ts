import "server-only";

import {
  AgentOrigin,
  FeatureLinkKind,
  FeatureStatus,
  Role,
  StackType,
  SuggestionStatus,
} from "@prisma/client";
import { z } from "zod";

import { ROLE_RANK } from "@/lib/config";
import { db } from "@/lib/db";
import { normalizeFeatureName } from "@/lib/agent/features";
import type { FeatureImportSummary } from "@/lib/agent/types";

/**
 * Bulk feature-catalog import (development_plan.md Step 56). Populates the
 * workspace feature graph from a JSON document mapping features onto each
 * stack — a deliberate, human-curated alternative to agent extraction.
 *
 * Imported rows are CANONICAL (features ACTIVE/MANUAL, links CONFIRMED/MANUAL),
 * so they bypass the Step 50 review queue — which is why the route restricts
 * this to OWNER + DEV_LEAD. The apply is idempotent (reuse active features by
 * per-stack normalized name; promote/skip existing links) and transactional
 * (structural validation fails before any write).
 */

/* ------------------------------ Contract -------------------------------- */

const importFeatureSchema = z.object({
  name: z.string().trim().min(1).max(80),
  summary: z.string().trim().default(""),
});

const importStackSchema = z.object({
  name: z.string().trim().min(1).max(60),
  type: z.enum(StackType).default(StackType.OTHER),
  description: z.string().trim().optional(),
  features: z.array(importFeatureSchema).default([]),
});

const importLinkSchema = z.object({
  from: z.string().trim().min(1),
  to: z.string().trim().min(1),
  fromStack: z.string().trim().optional(),
  toStack: z.string().trim().optional(),
  kind: z.enum(FeatureLinkKind),
  rationale: z.string().trim().optional(),
});

export const featureImportSchema = z.object({
  stacks: z.array(importStackSchema).default([]),
  links: z.array(importLinkSchema).default([]),
});

export type FeatureImportPayload = z.output<typeof featureImportSchema>;

export type FeatureImportResult =
  | { ok: true; summary: FeatureImportSummary }
  | { ok: false; issues: string[] };

function requireRoleOnWorkspace(actorRole: Role, min: Role) {
  if (ROLE_RANK[actorRole] < ROLE_RANK[min]) {
    throw new Error(`Requires ${min}; have ${actorRole}.`);
  }
}

function summarizeIssues(error: z.ZodError): string[] {
  return error.issues
    .slice(0, 20)
    .map((i) => `${i.path.join(".") || "payload"}: ${i.message}`);
}

const norm = (s: string) => s.trim().toLowerCase();

/* ------------------------------- Apply ---------------------------------- */

export async function importFeatureGraph(opts: {
  workspaceId: string;
  actorRole: Role;
  payload: unknown;
}): Promise<FeatureImportResult> {
  requireRoleOnWorkspace(opts.actorRole, Role.DEV_LEAD);

  const parsed = featureImportSchema.safeParse(opts.payload);
  if (!parsed.success) {
    return { ok: false, issues: summarizeIssues(parsed.error) };
  }
  const payload = parsed.data;
  if (payload.stacks.length === 0 && payload.links.length === 0) {
    return { ok: false, issues: ["payload: nothing to import (no stacks or links)."] };
  }

  const summary: FeatureImportSummary = {
    stacksCreated: 0,
    featuresCreated: 0,
    featuresReused: 0,
    linksCreated: 0,
    linksSkipped: 0,
    errors: [],
  };

  await db.$transaction(async (tx) => {
    const { workspaceId } = opts;

    // 1) Resolve/create stacks (match existing by case-insensitive name).
    const existingStacks = await tx.stack.findMany({
      where: { workspaceId },
      select: { id: true, name: true, position: true },
    });
    const stackByName = new Map(existingStacks.map((s) => [norm(s.name), s.id]));
    let maxPosition = existingStacks.reduce((m, s) => Math.max(m, s.position), 0);

    for (const stack of payload.stacks) {
      if (stackByName.has(norm(stack.name))) continue;
      maxPosition += 1;
      const created = await tx.stack.create({
        data: {
          workspaceId,
          name: stack.name,
          type: stack.type,
          description: stack.description ?? null,
          position: maxPosition,
        },
        select: { id: true },
      });
      stackByName.set(norm(stack.name), created.id);
      summary.stacksCreated += 1;
    }

    // 2) Resolve/create features per stack (reuse active by normalized name).
    const existing = await tx.feature.findMany({
      where: { workspaceId, archivedAt: null },
      select: { id: true, stackId: true, name: true },
    });
    // `${stackId}:${normName}` → featureId, for active features.
    const featureKey = new Map(
      existing.map((f) => [`${f.stackId}:${normalizeFeatureName(f.name)}`, f.id]),
    );

    for (const stack of payload.stacks) {
      const stackId = stackByName.get(norm(stack.name))!;
      for (const feat of stack.features) {
        const key = `${stackId}:${normalizeFeatureName(feat.name)}`;
        if (featureKey.has(key)) {
          summary.featuresReused += 1;
          continue;
        }
        const created = await tx.feature.create({
          data: {
            workspaceId,
            stackId,
            name: feat.name,
            summary: feat.summary,
            status: FeatureStatus.ACTIVE,
            origin: AgentOrigin.MANUAL,
          },
          select: { id: true },
        });
        featureKey.set(key, created.id);
        summary.featuresCreated += 1;
      }
    }

    // 3) Build a name → features index over ALL active features (existing +
    //    just-created) so links can target features outside the payload too.
    const allActive = await tx.feature.findMany({
      where: { workspaceId, archivedAt: null },
      select: { id: true, stackId: true, name: true },
    });
    const byName = new Map<string, { stackId: string; featureId: string }[]>();
    for (const f of allActive) {
      const k = normalizeFeatureName(f.name);
      (byName.get(k) ?? byName.set(k, []).get(k)!).push({
        stackId: f.stackId,
        featureId: f.id,
      });
    }

    const resolve = (
      name: string,
      stackName: string | undefined,
      side: string,
    ): string | null => {
      const matches = byName.get(normalizeFeatureName(name)) ?? [];
      if (matches.length === 0) {
        summary.errors.push(`Link ${side} "${name}" matches no feature — skipped.`);
        return null;
      }
      if (stackName) {
        const stackId = stackByName.get(norm(stackName));
        if (!stackId) {
          summary.errors.push(`Link ${side} stack "${stackName}" not found — skipped.`);
          return null;
        }
        const inStack = matches.find((m) => m.stackId === stackId);
        if (!inStack) {
          summary.errors.push(
            `Link ${side} "${name}" not found in stack "${stackName}" — skipped.`,
          );
          return null;
        }
        return inStack.featureId;
      }
      if (matches.length > 1) {
        summary.errors.push(
          `Link ${side} "${name}" is ambiguous across stacks — add ${side}Stack — skipped.`,
        );
        return null;
      }
      return matches[0].featureId;
    };

    // 4) Resolve and upsert links (canonical). Per-link problems are
    //    collected as non-fatal errors; the rest still imports.
    for (const link of payload.links) {
      const fromId = resolve(link.from, link.fromStack, "from");
      const toId = resolve(link.to, link.toStack, "to");
      if (!fromId || !toId) continue;
      if (fromId === toId) {
        summary.errors.push(`Link "${link.from}" → "${link.to}" is a self-link — skipped.`);
        continue;
      }

      const existingLink = await tx.featureLink.findUnique({
        where: {
          fromFeatureId_toFeatureId_kind: {
            fromFeatureId: fromId,
            toFeatureId: toId,
            kind: link.kind,
          },
        },
        select: { id: true, status: true },
      });
      if (existingLink) {
        if (existingLink.status === SuggestionStatus.CONFIRMED) {
          summary.linksSkipped += 1;
        } else {
          // Promote a SUGGESTED/REJECTED row in place (matches createLink).
          await tx.featureLink.update({
            where: { id: existingLink.id },
            data: {
              status: SuggestionStatus.CONFIRMED,
              origin: AgentOrigin.MANUAL,
              confidence: null,
              ...(link.rationale ? { rationale: link.rationale } : {}),
            },
          });
          summary.linksCreated += 1;
        }
        continue;
      }

      await tx.featureLink.create({
        data: {
          workspaceId,
          fromFeatureId: fromId,
          toFeatureId: toId,
          kind: link.kind,
          status: SuggestionStatus.CONFIRMED,
          origin: AgentOrigin.MANUAL,
          rationale: link.rationale ?? null,
        },
      });
      summary.linksCreated += 1;
    }
  });

  return { ok: true, summary };
}
