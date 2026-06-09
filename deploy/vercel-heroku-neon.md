# Deploying PRDMaker — Vercel + Heroku + Neon (Step 37)

This is the managed/serverless deployment path. The repo also ships a
self-hosted Docker path (`Dockerfile`, `docker-compose.prod.yml`,
`scripts/prod-docker.sh`, `deploy/caddy`, `deploy/nginx`); the two are
independent — pick one.

## Topology

| Piece                | Runs on  | Why                                                                 |
| -------------------- | -------- | ------------------------------------------------------------------- |
| Next.js web app      | Vercel   | Serverless functions + edge middleware for the app and API routes.  |
| Hocuspocus collab    | Heroku   | Long-lived WebSocket process — **cannot** run on Vercel functions.  |
| Postgres             | Neon     | Serverless Postgres with pooled + direct connection strings.        |

The collab server persists Yjs document state **to Postgres** (the
`@hocuspocus/extension-database` writes `Page.yDocState`), so the Heroku dyno is
disk-stateless — Heroku's ephemeral filesystem is fine.

## Why the code is Vercel-safe

- **Edge middleware is adapter-free.** `src/middleware.ts` imports the
  Prisma-free `src/auth.config.ts` (JWT sessions), so it runs on the Edge
  runtime without dragging in Node-only Prisma.
- **Node-only routes pin `runtime = "nodejs"`** (PDF export, embeds resolve,
  AI chat, AI apply) — `@react-pdf/renderer`, `node:crypto`, the Anthropic SDK
  and `jsonwebtoken` all need Node.
- **Streaming / loop routes set `maxDuration`** so Vercel doesn't abort them at
  the default ~15s timeout: AI chat (60s), PDF export (60s), the cron sweep
  (60s), AI apply (30s), embed resolve (15s).
- **`@react-pdf/renderer` is in `serverExternalPackages`** (`next.config.ts`)
  so its font/native deps resolve from `node_modules` at runtime instead of
  being bundled (a common "works locally, 500s on Vercel" failure).
- **Prisma ships the Lambda engine.** `schema.prisma` lists
  `binaryTargets = ["native", "rhel-openssl-3.0.x"]`, and `postinstall` runs
  `prisma generate` on every Vercel install.

## 1) Neon (Postgres)

1. Create a Neon project; create a `main` branch (production) and optionally a
   `staging` branch.
2. Grab **two** connection strings from the Neon dashboard:
   - **Pooled** (host contains `-pooler`) → the app's `DATABASE_URL`. Append
     `?sslmode=require` (and `&pgbouncer=true` if Neon doesn't already).
   - **Direct** (no `-pooler`) → used for migrations and by the collab server.

## 2) Heroku (collab server)

The collab server ships as a Docker image (reusing `apps/collab/Dockerfile`)
through Heroku's **Container Registry** — Heroku's router proxies WebSockets
natively. Run from `apps/collab/`:

```bash
heroku login
heroku create prdmaker-collab                 # globally-unique app name
heroku stack:set container -a prdmaker-collab
heroku config:set -a prdmaker-collab \
  DATABASE_URL="postgresql://<neon-direct-url>" \
  COLLAB_SECRET="$(openssl rand -hex 32)"
heroku container:login
heroku container:push web -a prdmaker-collab
heroku container:release web -a prdmaker-collab
heroku ps:type basic -a prdmaker-collab       # see dyno note below
```

Notes that matter for a WebSocket workload:

- **Run exactly ONE web dyno.** Hocuspocus holds documents in memory and this
  build has no Redis adapter, so a second dyno would not share state — editors
  on different dynos wouldn't see each other's changes. To scale out, add
  `@hocuspocus/extension-redis` first, then you can raise the dyno count.
- **Use a Basic (or Standard) dyno, not Eco.** Eco dynos sleep after 30 min of
  inactivity, which drops live sessions. Basic dynos never sleep.
- **No app changes were needed.** The server reads Heroku's dynamic `$PORT`,
  binds `0.0.0.0` (the Hocuspocus default), and pings every 30s — comfortably
  under Heroku's 55-second idle-WebSocket cutoff, so idle editors stay
  connected.
- Keep `COLLAB_SECRET` identical to the web app's. The browser connects over
  **`wss://prdmaker-collab.herokuapp.com`** (Vercel serves HTTPS, so a `ws://`
  collab URL is blocked as mixed content). Confirm your exact host with
  `heroku info -a prdmaker-collab`.

## 3) Vercel (web app)

1. Import the GitHub repo. Framework preset: **Next.js** (build/install are
   auto-detected; `.vercelignore` keeps `apps/`, `deploy/`, Docker files out of
   the build).
2. Set environment variables (Production + Preview):

   | Variable                  | Value                                                      |
   | ------------------------- | ---------------------------------------------------------- |
   | `DATABASE_URL`            | Neon **pooled** URL (`-pooler`, `?sslmode=require`)        |
   | `AUTH_SECRET`             | `openssl rand -base64 32`                                  |
   | `AUTH_URL`                | `https://your-domain`                                      |
   | `NEXT_PUBLIC_APP_URL`     | `https://your-domain`                                      |
   | `NEXT_PUBLIC_COLLAB_URL`  | `wss://prdmaker-collab.herokuapp.com`                      |
   | `COLLAB_URL`              | `wss://prdmaker-collab.herokuapp.com`                      |
   | `COLLAB_SECRET`           | same hex secret you set on Heroku                          |
   | `RESEND_API_KEY` / `RESEND_FROM` | Resend prod key + verified `From`                   |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth creds (optional)                  |
   | `ANTHROPIC_API_KEY`       | managed-tier server key (optional)                         |
   | `ENCRYPTION_KEY`          | `openssl rand -hex 32` (for BYO key storage)               |
   | `CRON_SECRET`             | `openssl rand -hex 32` (Vercel sends it to the cron route) |
   | `STRIPE_*`, `JACKSON_API_KEY`, `*_SENTRY_*`, `*_POSTHOG_*` | as features are enabled |

3. **Cron:** `vercel.json` schedules `/api/cron/snapshot-dirty` every 30 min.
   Sub-daily cron schedules require a **Vercel Pro** plan (Hobby runs crons at
   most once per day).
4. Point your domain's DNS at Vercel; configure Resend domain DNS (SPF, DKIM,
   DMARC); set the Stripe webhook to `https://your-domain/api/...`.

## 4) GitHub Actions

- **`ci.yml`** (push + PR): web typecheck → lint → unit (`--if-present`) →
  build, and collab typecheck → build. Unit/e2e jobs light up when Steps 35/36
  land.
- **`deploy.yml`** (push to `main`): runs `prisma migrate deploy` against the
  **direct** Neon URL, then `heroku container:push` + `release` for the collab
  app. The web app is redeployed by Vercel's own Git integration, so this
  workflow intentionally does not deploy it.

Repository secrets to add (Settings → Secrets and variables → Actions):

| Secret                  | Used for                                                       |
| ----------------------- | -------------------------------------------------------------- |
| `DATABASE_URL_UNPOOLED` | `prisma migrate deploy` (Neon **direct** URL)                  |
| `HEROKU_API_KEY`        | `heroku container:push/release` (`heroku authorizations:create`) |
| `HEROKU_COLLAB_APP`     | the collab app name, e.g. `prdmaker-collab`                    |

> Ordering: with Vercel's Git integration, the web redeploy and this workflow's
> migration run race. Keep migrations additive/backward-compatible (as the
> existing migrations are) so order doesn't matter, or disable the Git
> integration and have `deploy.yml` own the Vercel deploy (`vercel deploy --prod`
> with `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID`).

## 5) Production smoke test

Before announcing, verify against production:

- [ ] Sign in (magic link **and** Google)
- [ ] Create a workspace and a page
- [ ] Open the same page in two browsers → live multiplayer + presence (this
      exercises the Heroku `wss://` path)
- [ ] AI side-panel chat streams a reply (exercises `maxDuration`)
- [ ] Export a page to PDF (exercises `@react-pdf/renderer` on Vercel)
- [ ] Publish a page to its public URL
- [ ] Stripe checkout with a test card (once billing/Step 24 is live)
- [ ] `GET /api/cron/snapshot-dirty` with `Authorization: Bearer $CRON_SECRET`
      returns a JSON summary (and 403 without it)
