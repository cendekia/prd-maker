import { Role } from "@prisma/client";

/**
 * Workspace-role presentation helpers (Step 55). Client-safe on purpose — it
 * imports only the Prisma `Role` enum, never `@/lib/config` (which pulls in
 * `@/env`), so client components can render role labels. Rank/gating logic
 * lives in `src/lib/config.ts` (ROLE_RANK), used server-side.
 */

/** Human labels for each role. */
export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  DEV_LEAD: "Dev Lead",
  EDITOR: "Editor",
  VIEWER: "Viewer",
};

/** Roles offered in the members/invite pickers, most-privileged first. */
export const ASSIGNABLE_ROLES: Role[] = [
  Role.OWNER,
  Role.DEV_LEAD,
  Role.EDITOR,
  Role.VIEWER,
];
