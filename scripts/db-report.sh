#!/usr/bin/env bash
# Print a snapshot of workspaces, members, pages and AI usage from the running
# PRDMaker Postgres container. Useful for a quick "who has what / who's burning
# AI quota" view during the beta without opening a SQL client.
#
# Usage:
#   ./scripts/db-report.sh                     # show everything
#   ./scripts/db-report.sh acme-corp           # filter to one workspace (by slug)
#   ./scripts/db-report.sh --csv               # CSV-style output
#
# AI quota is metered per workspace per month (the AiUsage table). Per-user
# token usage is NOT metered — the per-user section shows AI activity (threads
# / messages) and whether the user brought their own key (which bypasses the
# managed cap). The managed FREE cap reference lives in src/lib/config.ts.
#
# Reads from the in-network postgres service defined in docker-compose.prod.yml.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILE="docker-compose.prod.yml"

# ---------- args ----------
FILTER_SLUG=""
FORMAT_FLAGS='\pset format aligned'
for arg in "$@"; do
  case "$arg" in
    --csv) FORMAT_FLAGS='\pset format csv' ;;
    -h|--help)
      sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    --*) echo "Unknown flag: $arg" >&2; exit 1 ;;
    *) FILTER_SLUG="$arg" ;;
  esac
done

# ---------- preflight ----------
if ! docker compose -f "$COMPOSE_FILE" ps postgres --status running --quiet | grep -q .; then
  echo "postgres container isn't running."
  echo "Start the stack first:  docker compose -f $COMPOSE_FILE up -d"
  exit 1
fi

# ---------- query ----------
# Build a `WHERE` fragment that filters to one workspace when a slug arg is
# provided. We pass it as a psql variable so quoting stays safe.
if [ -n "$FILTER_SLUG" ]; then
  WS_FILTER="WHERE w.slug = :'slug'"
else
  WS_FILTER=""
fi

docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -U postgres -d prdmaker \
  -v "slug=${FILTER_SLUG}" \
  <<SQL
\\pset border 2
${FORMAT_FLAGS}
\\pset null '∅'
\\timing off

-- Managed FREE-tier monthly token cap (keep in sync with src/lib/config.ts
-- AI_MANAGED_MONTHLY_TOKEN_CAP.FREE). Used only for the %-of-cap column below.
\\set free_cap 100000

\\echo
\\echo ── Workspaces ──────────────────────────────────────────────────────
SELECT
  w.slug                                                                    AS slug,
  w.name                                                                    AS name,
  w."createdAt"::date                                                       AS created,
  (SELECT count(*) FROM "WorkspaceMember" wm WHERE wm."workspaceId" = w.id) AS members,
  (SELECT count(*) FROM "Page" p
      WHERE p."workspaceId" = w.id AND p."archivedAt" IS NULL)              AS pages,
  (SELECT count(*) FROM "Page" p
      WHERE p."workspaceId" = w.id AND p."isPublished" = true)              AS published,
  (SELECT count(*) FROM "Epic" e
      WHERE e."workspaceId" = w.id AND e."archivedAt" IS NULL)              AS epics,
  (SELECT count(*) FROM "Comment" c
      JOIN "Page" p ON p.id = c."pageId"
      WHERE p."workspaceId" = w.id)                                         AS comments
FROM "Workspace" w
${WS_FILTER}
ORDER BY w."createdAt";

\\echo
\\echo ── Members per workspace ───────────────────────────────────────────
SELECT
  w.slug               AS workspace,
  wm.role              AS role,
  COALESCE(u.name, '—') AS name,
  u.email              AS email,
  wm."createdAt"::date AS joined
FROM "Workspace" w
JOIN "WorkspaceMember" wm ON wm."workspaceId" = w.id
JOIN "User" u             ON u.id           = wm."userId"
${WS_FILTER}
ORDER BY w."createdAt", wm.role, wm."createdAt";

\\echo
\\echo ── Pages per workspace ─────────────────────────────────────────────
SELECT
  w.slug                                                AS workspace,
  REPEAT('  ', LEAST(depth.d, 5)) || p.title            AS title,
  COALESCE(u.email, '—')                                AS author,
  p."createdAt"::date                                   AS created,
  CASE WHEN p."archivedAt" IS NOT NULL THEN 'archived'
       WHEN p."isPublished"            THEN 'published'
       ELSE 'draft' END                                 AS status,
  COALESCE(p."publicSlug", '')                          AS public_slug
FROM "Workspace" w
JOIN "Page" p ON p."workspaceId" = w.id
LEFT JOIN "User" u ON u.id = p."createdById"
-- Indent child pages by their depth in the tree (capped at 5 for readability).
LEFT JOIN LATERAL (
  WITH RECURSIVE chain AS (
    SELECT id, "parentId", 0 AS d FROM "Page" WHERE id = p.id
    UNION ALL
    SELECT pp.id, pp."parentId", c.d + 1
    FROM "Page" pp JOIN chain c ON pp.id = c."parentId"
  )
  SELECT max(d) AS d FROM chain WHERE "parentId" IS NULL OR d > 0
) depth ON true
${WS_FILTER}
ORDER BY w."createdAt", p."createdAt";

\\echo
\\echo ── AI usage by workspace & month (managed quota; FREE cap 100,000 tok/mo) ──
SELECT
  w.slug                                                               AS workspace,
  au.period                                                            AS month,
  au."requestCount"                                                    AS requests,
  au."inputTokens"                                                     AS input_tok,
  au."outputTokens"                                                    AS output_tok,
  (au."inputTokens" + au."outputTokens")                               AS total_tok,
  round(100.0 * (au."inputTokens" + au."outputTokens") / :free_cap, 1) AS free_cap_pct
FROM "AiUsage" au
JOIN "Workspace" w ON w.id = au."workspaceId"
${WS_FILTER}
ORDER BY au.period DESC, total_tok DESC;

\\echo
\\echo ── AI activity by user (tokens are metered per workspace, not per user) ──
SELECT
  u.email                                            AS "user",
  CASE WHEN u."anthropicKeyCipher" IS NOT NULL
       THEN '✓ ••' || COALESCE(u."anthropicKeyLast4", '????')
       ELSE '—' END                                  AS byo_key,
  count(DISTINCT t.id)                               AS threads,
  count(m.id) FILTER (WHERE m.role = 'user')         AS sent,
  count(m.id) FILTER (WHERE m.role = 'assistant')    AS received,
  max(m."createdAt")::date                           AS last_active
FROM "User" u
LEFT JOIN "AiThread" t   ON t."userId" = u.id
LEFT JOIN "Page" p       ON p.id = t."pageId"
LEFT JOIN "Workspace" w  ON w.id = p."workspaceId"
LEFT JOIN "AiMessage" m  ON m."threadId" = t.id
${WS_FILTER}
GROUP BY u.id, u.email, u."anthropicKeyCipher", u."anthropicKeyLast4"
HAVING count(DISTINCT t.id) > 0 OR u."anthropicKeyCipher" IS NOT NULL
ORDER BY sent DESC NULLS LAST, u.email;

\\echo
\\echo ── Totals ──────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM "User")                                     AS users,
  (SELECT count(*) FROM "Workspace")                                AS workspaces,
  (SELECT count(*) FROM "WorkspaceMember")                          AS memberships,
  (SELECT count(*) FROM "Page" WHERE "archivedAt" IS NULL)          AS pages_active,
  (SELECT count(*) FROM "Page" WHERE "isPublished" = true)          AS pages_published,
  (SELECT count(*) FROM "PageVersion")                              AS versions,
  (SELECT count(*) FROM "Comment")                                  AS comments;

\\echo
\\echo ── AI & content totals ─────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM "Template")                                       AS templates,
  (SELECT count(*) FROM "Epic" WHERE "archivedAt" IS NULL)                AS epics,
  (SELECT count(*) FROM "Notification")                                   AS notifications,
  (SELECT count(*) FROM "AiThread")                                       AS ai_threads,
  (SELECT count(*) FROM "AiMessage")                                      AS ai_messages,
  (SELECT count(*) FROM "User" WHERE "anthropicKeyCipher" IS NOT NULL)    AS byo_users,
  (SELECT COALESCE(sum("requestCount"), 0) FROM "AiUsage")                AS ai_requests,
  (SELECT COALESCE(sum("inputTokens" + "outputTokens"), 0) FROM "AiUsage") AS ai_tokens;
SQL
