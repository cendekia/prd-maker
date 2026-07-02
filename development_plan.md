<brainstorming>
The PRDMaker request is a substantial multi-tenant SaaS — Notion/Confluence-class editor, Yjs multiplayer, BYO-key AI panel, Stripe billing, magic-link/Google/SAML auth, GDPR-ready. The request didn't pin a stack, so I'll choose one that's idiomatic for this scope and that AI code generators can implement reliably:

- **Framework:** Next.js 15 (App Router), TypeScript, Tailwind v4, shadcn/ui
- **DB:** PostgreSQL via Prisma; hosted on Neon or Supabase
- **Auth:** Auth.js v5 with magic-link (Resend) + Google OAuth; SSO via SAML Jackson (BoxyHQ) gated to Business tier
- **Editor:** TipTap v2 + ProseMirror, with `y-prosemirror` binding
- **Real-time:** Yjs + Hocuspocus server (separate Node process) on Heroku; auth via JWT; persistence via Postgres
- **AI:** Anthropic SDK; user-supplied API key encrypted with AES-256-GCM using a server-side master key; streamed responses via Server-Sent Events
- **Billing:** Stripe (Checkout + Customer Portal + webhook); per-seat metered against workspace member count
- **Email:** Resend (magic links + notifications)
- **Search:** Postgres full-text search (tsvector + GIN); upgrade-path to Typesense if needed
- **Embeds:** oEmbed via iframely-compatible parser; manual handlers for Figma, Linear, Loom, YouTube
- **PDF export:** `@react-pdf/renderer` server-side
- **Hosting:** Next.js on Vercel; Hocuspocus on Heroku; Postgres on Neon

Architectural notes:
- **Tenancy:** Every domain row has a `workspaceId` FK. All queries scope by workspace via a request-context guard.
- **Permissions:** Role on `WorkspaceMember` (OWNER / EDITOR / VIEWER). Per-page ACLs sit in a `PagePermission` table, only checked when workspace plan = BUSINESS.
- **AI key encryption:** Master key from env (`ENCRYPTION_KEY`), AES-256-GCM, IV per record; ciphertext + IV + authTag stored on `User.anthropicKeyCipher`.
- **Yjs:** Each page has a Yjs document. Hocuspocus persists snapshots to Postgres `Page.yDocState` (bytea) on idle; client also writes to `PageVersion` on intervals/major edits for human-readable history.
- **AI version-history guarantee:** Before any AI write into the editor, the client (or a server middleware) calls `POST /api/pages/:id/snapshot` synchronously, then applies the AI delta. If snapshot fails, AI write is aborted.
- **Public publishing:** Snapshot of the current Yjs state is rendered to static HTML at publish time and re-rendered on each subsequent publish; published pages live at `/p/[slug]` and are SSR'd, no auth.
- **Dark mode:** Tailwind `class` strategy + `next-themes`, system/light/dark toggle.
- **Mobile:** App layout collapses to single pane below 768px; editor goes read-only and shows comments; AI panel hidden.

Step decomposition strategy:
The plan is sequenced so the spine (auth → workspaces → pages → editor → realtime) lands first, then features (comments, versions, templates, AI), then commercial (billing, SSO), then polish (compliance, exports, embeds, design, deploy). Each step touches ≤20 files and is implementable in one code-gen iteration. Where a step has unavoidable manual steps (Stripe dashboard config, DNS, SAML test IdP, email DNS), the user instructions section calls them out.

Total: ~38 steps across 11 sections.
</brainstorming>

# Implementation Plan

## Foundation & Project Setup

- [x] Step 1: Bootstrap Next.js 15 project with TypeScript, Tailwind, and shadcn/ui
  - **Task**: Initialize a Next.js 15 App Router project with TypeScript, Tailwind v4, ESLint, and the `src/` directory layout. Install and configure shadcn/ui with neutral palette and Inter font. Set up `next-themes` for system/light/dark toggle. Create base `app/layout.tsx` with theme provider, font loading, and a placeholder root page.
  - **Files**:
    - `package.json`: Next.js 15, React 19, TS, Tailwind v4, shadcn/ui deps, next-themes
    - `tsconfig.json`: strict mode, path aliases `@/*`
    - `tailwind.config.ts`: dark-mode `class` strategy, Inter font, neutral palette
    - `postcss.config.mjs`: Tailwind v4 setup
    - `src/app/layout.tsx`: HTML shell, font, theme provider
    - `src/app/page.tsx`: placeholder landing
    - `src/app/globals.css`: Tailwind directives, CSS variables for theming
    - `src/components/theme-provider.tsx`: next-themes wrapper
    - `src/components/ui/button.tsx`: shadcn/ui button
    - `components.json`: shadcn config
    - `.env.example`: placeholders for all upcoming env vars
    - `.gitignore`, `README.md`
  - **Step Dependencies**: none
  - **User Instructions**: After install, run `npm run dev` to confirm the placeholder page renders. Copy `.env.example` to `.env.local`.

- [x] Step 2: Configure environment, secrets, and runtime config module
  - **Task**: Create a typed env loader with Zod that validates every env var at boot and crashes fast if any are missing. Cover DB URL, Auth.js secret, Resend key, Google OAuth client/secret, Stripe keys, Anthropic encryption master key, Hocuspocus URL/secret, public app URL.
  - **Files**:
    - `src/env.ts`: Zod schema + `process.env` parser, exports typed `env`
    - `.env.example`: full list with comments
    - `src/lib/config.ts`: derived constants (e.g. plan limits, public URL)
    - `package.json`: add `zod`
  - **Step Dependencies**: Step 1
  - **User Instructions**: Generate a 32-byte master key for AI-key encryption: `openssl rand -hex 32`. Put it in `.env.local` as `ENCRYPTION_KEY`.

- [x] Step 3: Set up PostgreSQL, Prisma, and core schema (users, sessions, workspaces, members)
  - **Task**: Add Prisma, define initial schema for `User`, `Account`, `Session`, `VerificationToken` (Auth.js shape), `Workspace`, `WorkspaceMember` (with `role` enum OWNER/EDITOR/VIEWER), and `WorkspaceInvite`. Generate the Prisma client wrapper with a singleton pattern for Next.js dev.
  - **Files**:
    - `prisma/schema.prisma`: User, Account, Session, VerificationToken, Workspace, WorkspaceMember, WorkspaceInvite + Role enum
    - `src/lib/db.ts`: Prisma client singleton
    - `package.json`: `prisma`, `@prisma/client`
    - `prisma/migrations/.gitkeep`
  - **Step Dependencies**: Step 2
  - **User Instructions**: Provision a Postgres database (Neon or Supabase free tier). Put the connection string in `.env.local` as `DATABASE_URL`. Run `npx prisma migrate dev --name init`.

## Authentication & Workspaces

- [x] Step 4: Authentication — magic link + Google OAuth via Auth.js v5
  - **Task**: Configure Auth.js v5 with the Prisma adapter, Resend magic-link provider, and Google OAuth provider. Implement sign-in / sign-out / verify pages with shadcn forms. Add `auth()` server helper and middleware to gate authenticated routes (`/app/*`).
  - **Files**:
    - `src/auth.ts`: NextAuth config (providers, adapter, callbacks)
    - `src/middleware.ts`: route protection for `/app/*`
    - `src/app/api/auth/[...nextauth]/route.ts`
    - `src/app/(auth)/sign-in/page.tsx`: magic link + Google buttons
    - `src/app/(auth)/verify-request/page.tsx`: "check your email"
    - `src/app/(auth)/error/page.tsx`: error display
    - `src/lib/email.ts`: Resend client + magic-link template
    - `package.json`: `next-auth@beta`, `@auth/prisma-adapter`, `resend`
  - **Step Dependencies**: Step 3
  - **User Instructions**: Create a Google OAuth client (Google Cloud Console → APIs & Services → Credentials), add `http://localhost:3000/api/auth/callback/google` as redirect URI. Create a Resend account, verify a sending domain, paste API key into `.env.local`.

- [x] Step 5: First-run workspace creation flow
  - **Task**: After a user's first sign-in, force them through `/app/onboarding` to either create a new workspace (name + slug) or accept a pending invite. Implement the workspace creation server action that creates a `Workspace` and an `OWNER` `WorkspaceMember` for the current user. Workspace slug becomes `/app/[workspaceSlug]/...` for all in-app routes.
  - **Files**:
    - `src/app/(authed)/onboarding/page.tsx`: create-or-join UI
    - `src/app/(authed)/onboarding/actions.ts`: createWorkspace server action
    - `src/lib/workspace.ts`: helpers (`requireWorkspace`, `requireRole`)
    - `src/middleware.ts`: redirect users with no workspace to onboarding
  - **Step Dependencies**: Step 4
  - **User Instructions**: none

- [x] Step 6: Workspace settings, members, invites, roles
  - **Task**: Build `/app/[workspaceSlug]/settings` with tabs for General (rename, slug, delete), Members (list + role picker + remove), and Invites (generate email invites with role, copy link, revoke). Server actions for each. Email invites via Resend with a tokenized accept link `/invite/[token]`.
  - **Files**:
    - `src/app/(authed)/[workspaceSlug]/settings/layout.tsx`
    - `src/app/(authed)/[workspaceSlug]/settings/page.tsx`: General tab
    - `src/app/(authed)/[workspaceSlug]/settings/members/page.tsx`
    - `src/app/(authed)/[workspaceSlug]/settings/invites/page.tsx`
    - `src/app/(authed)/[workspaceSlug]/settings/actions.ts`: invite, revoke, change role, remove
    - `src/app/invite/[token]/page.tsx`: accept invite page
    - `src/app/invite/[token]/actions.ts`
    - `src/lib/email.ts`: invite email template
  - **Step Dependencies**: Step 5
  - **User Instructions**: none

## Page Model & Tree

- [x] Step 7: Database schema for pages, versions, comments, templates
  - **Task**: Add Prisma models: `Page` (id, workspaceId, parentId, title, slug, position, isPublished, publicSlug, yDocState bytea, createdById, archivedAt), `PageVersion` (id, pageId, snapshotJson, createdById, createdAt, kind enum AUTO/MANUAL/PRE_AI), `Comment` (id, pageId, anchor jsonb, body, parentId, resolvedAt, authorId), `Template` (id, workspaceId nullable for system templates, name, contentJson), `PagePermission` (id, pageId, userId, role) for Business-tier per-page ACLs.
  - **Files**:
    - `prisma/schema.prisma`: append the new models + enums
    - `src/lib/types.ts`: shared TS types for page tree node, comment anchor
  - **Step Dependencies**: Step 3
  - **User Instructions**: Run `npx prisma migrate dev --name pages_and_friends`.

- [x] Step 8: Page CRUD server actions and API
  - **Task**: Implement server actions and `/api/workspaces/[id]/pages` routes for: create page (under optional parentId, copies a template if provided), rename, archive, delete (soft → hard after 30 days), reparent + reorder (compute fractional `position` to avoid full re-sorts). Enforce role-based access via `requireRole`. Trigger search-index update on every write (placeholder, wired in Step 22).
  - **Files**:
    - `src/app/api/workspaces/[workspaceId]/pages/route.ts`: POST create, GET tree
    - `src/app/api/workspaces/[workspaceId]/pages/[pageId]/route.ts`: PATCH, DELETE
    - `src/app/api/workspaces/[workspaceId]/pages/[pageId]/move/route.ts`: reparent/reorder
    - `src/lib/pages.ts`: page service functions
    - `src/lib/permissions.ts`: page-access checks
  - **Step Dependencies**: Step 7
  - **User Instructions**: none

- [x] Step 9: Three-pane app shell + page tree sidebar with drag-and-drop
  - **Task**: Build the main authed layout: left tree (collapsible, drag-and-drop reparent via `dnd-kit`), center editor placeholder, right collapsible AI panel placeholder. Top bar with breadcrumb, presence avatars placeholder, share/publish button placeholder, workspace switcher. Tree shows hierarchy, supports right-click context menu (rename, duplicate, archive, delete), and search-as-you-type filter.
  - **Files**:
    - `src/app/(authed)/[workspaceSlug]/layout.tsx`: three-pane shell
    - `src/components/app-shell/sidebar.tsx`
    - `src/components/app-shell/page-tree.tsx`: dnd-kit tree
    - `src/components/app-shell/page-tree-node.tsx`
    - `src/components/app-shell/topbar.tsx`
    - `src/components/app-shell/workspace-switcher.tsx`
    - `src/components/app-shell/ai-panel.tsx`: collapsible empty stub
    - `src/hooks/use-page-tree.ts`: SWR-style fetcher
    - `package.json`: `@dnd-kit/core`, `@dnd-kit/sortable`
  - **Step Dependencies**: Step 8
  - **User Instructions**: none

## Editor & Real-Time Collaboration

- [x] Step 10: TipTap editor with core marks, blocks, and slash command menu
  - **Task**: Set up TipTap v2 in the center pane with: paragraph, headings 1–3, lists, task list, blockquote, code block (lowlight syntax highlighting), tables, horizontal rule, image upload (S3-compatible signed URL flow stubbed for now to data-URL), link with paste handler, and a slash-command menu (`/heading`, `/table`, etc.) using `@tiptap/suggestion`. Persist content as JSON to `Page.contentJson` (serial, not yet collaborative).
  - **Files**:
    - `src/components/editor/editor.tsx`: TipTap root
    - `src/components/editor/extensions.ts`: extension list
    - `src/components/editor/slash-command.tsx`
    - `src/components/editor/slash-command-list.tsx`
    - `src/components/editor/bubble-menu.tsx`
    - `src/components/editor/floating-menu.tsx`
    - `src/app/(authed)/[workspaceSlug]/p/[pageId]/page.tsx`: editor host
    - `src/app/api/pages/[pageId]/content/route.ts`: GET/PUT contentJson
    - `package.json`: TipTap v2 + extensions, lowlight
  - **Step Dependencies**: Step 9
  - **User Instructions**: none

- [x] Step 11: Internal page links `[[Page name]]` and Cmd-K palette
  - **Task**: Add a `PageLink` TipTap extension that renders `[[Title]]` markup as a styled chip linking to the target page within the workspace. Implement the global Cmd-K (Ctrl-K on Windows) command palette using `cmdk`: search across pages by title, jump to page, or insert a `[[Page]]` link into the current editor selection.
  - **Files**:
    - `src/components/editor/extensions/page-link.ts`
    - `src/components/editor/extensions/page-link-suggestion.ts`
    - `src/components/command-palette.tsx`
    - `src/hooks/use-command-palette.ts`
    - `src/components/editor/extensions.ts`: include PageLink
    - `src/app/api/workspaces/[workspaceId]/pages/search/route.ts`: title-only search for the palette
    - `package.json`: `cmdk`
  - **Step Dependencies**: Step 10
  - **User Instructions**: none

- [x] Step 12: Hocuspocus collaboration server + Yjs binding
  - **Task**: Stand up a separate Node service `apps/collab` running Hocuspocus. Authenticate connections by short-lived JWT issued from the Next.js app (signed with `COLLAB_SECRET`), authorize on `pageId` + `workspaceMember.role`. Persist Yjs state to Postgres `Page.yDocState` on idle and on disconnect. Wire `y-prosemirror` + `y-websocket` provider into the TipTap editor with awareness (cursors / presence colors).
  - **Files**:
    - `apps/collab/package.json`
    - `apps/collab/src/server.ts`: Hocuspocus server
    - `apps/collab/src/auth.ts`: JWT verify
    - `apps/collab/src/persistence.ts`: load/save Yjs state to Postgres
    - `apps/collab/Dockerfile`
    - `src/lib/collab-token.ts`: issue JWT in Next.js
    - `src/app/api/collab/token/route.ts`: returns JWT for current user+page
    - `src/components/editor/editor.tsx`: integrate `y-prosemirror`, awareness, presence cursors
    - `package.json`: `yjs`, `y-prosemirror`, `@hocuspocus/provider`
    - `apps/collab/package.json` deps: `@hocuspocus/server`, `@hocuspocus/extension-database`, `yjs`, `jsonwebtoken`
  - **Step Dependencies**: Step 10
  - **User Instructions**: Generate `COLLAB_SECRET` (`openssl rand -hex 32`) and put into both Next.js `.env.local` and `apps/collab/.env`. Run the collab server locally with `cd apps/collab && npm run dev`.

- [x] Step 13: Presence avatars in top bar
  - **Task**: Use Yjs awareness to show, in the top bar, avatars of every user currently viewing the page. Each user's awareness state contains `userId`, `name`, `avatarUrl`, `color`. Show first 5 avatars + "+N" overflow with a hover popover listing all viewers.
  - **Files**:
    - `src/components/app-shell/presence-avatars.tsx`
    - `src/components/app-shell/topbar.tsx`: mount presence component
    - `src/hooks/use-presence.ts`
  - **Step Dependencies**: Step 12
  - **User Instructions**: none

## Comments

- [x] Step 14: Inline + page-level comments with anchors and @mentions
  - **Task**: Add a `Comment` TipTap mark that wraps the anchored text range and stores `commentId`. Implement a comments side-rail (collapsible drawer right-of-editor) listing threads in document order with reply, resolve, reopen actions. Add `@user` mention extension that surfaces members of the workspace; mentioning creates a `Notification` row (delivery wired in Step 18).
  - **Files**:
    - `src/components/editor/extensions/comment-mark.ts`
    - `src/components/editor/extensions/mention.ts`
    - `src/components/comments/comments-rail.tsx`
    - `src/components/comments/comment-thread.tsx`
    - `src/components/comments/comment-input.tsx`
    - `src/app/api/pages/[pageId]/comments/route.ts`: GET, POST
    - `src/app/api/pages/[pageId]/comments/[commentId]/route.ts`: PATCH (resolve), DELETE
    - `src/lib/notifications.ts`: enqueue helper (in-app row only for now)
  - **Step Dependencies**: Step 12
  - **User Instructions**: none

## Version History

- [x] Step 15: Auto-snapshots, manual snapshots, and pre-AI snapshots
  - **Task**: Add a debounced client-side trigger that POSTs `Page.contentJson` to `/api/pages/:id/snapshot` every N minutes of activity, and a server cron (Vercel cron or Hocuspocus extension) that snapshots all dirty pages every 30 minutes. Define snapshot kinds: `AUTO`, `MANUAL`, `PRE_AI`. Each snapshot stores the canonical Yjs state plus a JSON projection for cheap diff rendering.
  - **Files**:
    - `src/app/api/pages/[pageId]/snapshot/route.ts`: POST
    - `src/lib/snapshots.ts`: takeSnapshot(pageId, kind, userId)
    - `src/app/api/cron/snapshot-dirty/route.ts`: scheduled job
    - `vercel.json`: cron config
    - `src/hooks/use-auto-snapshot.ts`: debounced client trigger
  - **Step Dependencies**: Step 12
  - **User Instructions**: After deploy, verify the cron is registered in the Vercel dashboard.

- [x] Step 16: Version history UI — list, diff view, restore
  - **Task**: Page-level "History" drawer listing all `PageVersion` rows newest-first with author, timestamp, kind badge. Click any version to open a side-by-side diff view (left = selected version, right = current). Diff is computed on the JSON projection by `prosemirror-changeset` rendered as additions/deletions in red/green. Restore button overwrites Yjs doc with the chosen snapshot (broadcasts via Hocuspocus so all viewers update live).
  - **Files**:
    - `src/components/version-history/history-drawer.tsx`
    - `src/components/version-history/version-list.tsx`
    - `src/components/version-history/diff-view.tsx`
    - `src/lib/diff.ts`: prosemirror-changeset wrapper
    - `src/app/api/pages/[pageId]/versions/route.ts`: GET
    - `src/app/api/pages/[pageId]/versions/[versionId]/restore/route.ts`: POST
    - `package.json`: `prosemirror-changeset`
  - **Step Dependencies**: Step 15
  - **User Instructions**: none

## Templates

- [x] Step 17: Template picker, system templates, and workspace custom templates
  - **Task**: Seed system templates (Feature PRD, Tech Spec, RFC, One-Pager, Bug Report) into the DB on migration. Build "+ New page" dropdown that opens a template picker modal. Add `/app/[workspaceSlug]/settings/templates` for admins (OWNER) to publish custom workspace templates from any existing page.
  - **Files**:
    - `prisma/seed.ts`: insert system templates
    - `src/app/(authed)/[workspaceSlug]/settings/templates/page.tsx`
    - `src/app/(authed)/[workspaceSlug]/settings/templates/actions.ts`
    - `src/components/templates/template-picker.tsx`
    - `src/components/app-shell/new-page-button.tsx`
    - `src/app/api/workspaces/[workspaceId]/templates/route.ts`
    - `package.json`: add `"prisma": { "seed": "tsx prisma/seed.ts" }`
  - **Step Dependencies**: Step 8
  - **User Instructions**: Run `npx prisma db seed` to load system templates.

## Notifications

- [x] Step 18: Notification model, in-app inbox, and email delivery
  - **Task**: Add `Notification` Prisma model (id, userId, type, payload jsonb, readAt). Build the bell-icon inbox in the top bar with unread badge. Wire the existing notification triggers (mention, comment reply, page share, invite) to also send email via Resend, respecting per-user preferences in `/app/account/notifications`.
  - **Files**:
    - `prisma/schema.prisma`: add Notification + NotificationPreference
    - `src/lib/notifications.ts`: extend with email dispatch
    - `src/components/notifications/inbox.tsx`
    - `src/components/notifications/notification-bell.tsx`
    - `src/app/(authed)/account/notifications/page.tsx`
    - `src/app/api/notifications/route.ts`: GET, mark-read
    - `src/lib/email.ts`: notification email templates
  - **Step Dependencies**: Step 14, Step 6
  - **User Instructions**: Run `npx prisma migrate dev --name notifications`.

## AI Assistant

> **AI model — hybrid (decided 2026-06-05).** Everyone gets a **managed** assistant: the server holds one Anthropic key and serves a cheap model (**Claude Haiku**) under per-plan usage quotas — no key or setup required, which removes the adoption/trust barrier of "paste your API key." Adding a **personal API key is optional** and unlocks a stronger model (Sonnet) + higher limits + the user's own data boundary. A provider resolver picks the server key vs the user's key per request. This replaces the original "BYO-key required" design.

- [x] Step 19: AI provider — managed default (server key) + optional BYO key + usage quotas
  - **Task**: Build the AI access layer. **Managed default:** the server holds `ANTHROPIC_API_KEY` and requests use Claude **Haiku** — works for every user with no setup. **Optional BYO:** add `User.anthropicKeyCipher`, `anthropicKeyIv`, `anthropicKeyTag` columns, AES-256-GCM encrypt/decrypt with `ENCRYPTION_KEY`, and an optional `/account/api-keys` page (paste, "Test connection" against Anthropic `/v1/models`, store, rotate, remove; never log the key, never return it after save — show only "•••• last4"). **Resolver:** `resolveAiClient({ workspaceId, userId })` returns `{ client, model, byo }` — the user's decrypted key + a stronger model (Sonnet) when present, otherwise the server key + Haiku. **Quotas:** add an `AiUsage` model (workspaceId, period, inputTokens, outputTokens, requestCount) plus `assertWithinQuota` / `recordUsage`; per-plan monthly token caps in config (managed usage is metered; BYO bypasses the managed cap).
  - **Files**:
    - `prisma/schema.prisma`: optional BYO key columns on `User`; `AiUsage` model
    - `src/lib/crypto.ts`: AES-256-GCM helpers
    - `src/lib/ai.ts`: `resolveAiClient` (server-key default + Haiku; user-key override + Sonnet) + model constants
    - `src/lib/ai-usage.ts`: quota check + usage recording
    - `src/lib/config.ts`: AI model ids + per-plan AI token quotas
    - `src/app/(authed)/account/api-keys/page.tsx` + `actions.ts`: optional personal-key management
    - `src/app/api/account/api-keys/test/route.ts`
    - `src/env.ts` / `.env.example`: add server `ANTHROPIC_API_KEY`
    - `package.json`: `@anthropic-ai/sdk`
  - **Step Dependencies**: Step 4
  - **User Instructions**: Put a server `ANTHROPIC_API_KEY` in env (powers the free managed tier). Run `npx prisma migrate dev --name ai_provider`.

- [x] Step 20: AI side-panel chat — streaming, page context, quota enforcement
  - **Task**: Implement the right-side AI panel with a per-page chat thread (`AiThread`, `AiMessage`). Stream responses via Server-Sent Events using `resolveAiClient` (managed Haiku by default; the user's key + Sonnet if they added one). The system prompt includes the current page's plain-text content. **Enforce quotas:** `assertWithinQuota` before a managed request, `recordUsage` after streaming (token counts from the response). When the managed quota is exhausted, show an "out of AI credits" state with CTAs to upgrade the plan or add a personal key (BYO skips the managed cap). Replace the placeholder panel from Step 9.
  - **Files**:
    - `prisma/schema.prisma`: AiThread, AiMessage
    - `src/components/ai-panel/ai-panel.tsx`
    - `src/components/ai-panel/message.tsx`
    - `src/components/ai-panel/composer.tsx`
    - `src/components/ai-panel/quota-notice.tsx`: quota-reached / upgrade CTA
    - `src/app/api/ai/chat/route.ts`: SSE — resolve client → quota check → stream → record usage
    - `src/lib/ai-context.ts`: build page-context system prompt
    - `src/hooks/use-ai-chat.ts`
  - **Step Dependencies**: Step 19, Step 10
  - **User Instructions**: Run `npx prisma migrate dev --name ai_threads`.

- [x] Step 21: Guided Request → Plan → Spec workflow with safe AI writes into the page
  - **Task**: Add a "Guide me" mode in the AI panel that walks the user through three stages using the bundled prompts (`request_prompt.md` template logic, `plan_prompt.md` template logic, plus a final spec stage), reusing the Step 19 resolver + Step 20 quota path. At each stage where AI proposes content for the page, render a "Apply to page" button. Clicking it calls `takeSnapshot(pageId, 'PRE_AI')` (Step 15) and only on success applies the AI's structured edit to the Yjs doc via a server-authored transform. If the snapshot fails, the apply button shows an error and does not write.
  - **Files**:
    - `src/lib/ai-prompts.ts`: bundled prompt templates
    - `src/components/ai-panel/guided-mode.tsx`
    - `src/components/ai-panel/apply-to-page-button.tsx`
    - `src/lib/ai-apply.ts`: snapshot-then-apply orchestrator
    - `src/app/api/ai/apply/route.ts`: server endpoint that snapshots + emits a Yjs update
  - **Step Dependencies**: Step 20, Step 15
  - **User Instructions**: none

## Search

- [ ] Step 22: Workspace-wide full-text search (Postgres tsvector + GIN)
  - **Task**: Add a `search_vector` generated column on `Page` over `title || content_text`, GIN-indexed. Maintain `Page.contentText` (plain-text projection) on every save. Add `/app/[workspaceSlug]/search?q=...` results page and integrate into the Cmd-K palette as a second tab "Full-text search". Snippet rendering uses `ts_headline`.
  - **Files**:
    - `prisma/migrations/.../migration.sql`: ALTER TABLE Page ADD search_vector + GIN index (raw SQL because Prisma doesn't model generated cols)
    - `src/lib/pages.ts`: write `contentText` on every content update
    - `src/app/(authed)/[workspaceSlug]/search/page.tsx`
    - `src/app/api/workspaces/[workspaceId]/search/route.ts`
    - `src/components/command-palette.tsx`: add full-text tab
  - **Step Dependencies**: Step 8, Step 11
  - **User Instructions**: After migrate, manually backfill `contentText` for any existing pages: `UPDATE "Page" SET "contentText" = ...` (script provided in `/scripts/backfill-content-text.ts`).

## Public Publishing

- [x] Step 23: Publish to public read-only URL
  - **Task**: Add `Page.isPublished`, `Page.publicSlug` (unique). "Publish" button in top bar opens a popover with toggle, custom-slug input, and copy-link. On publish, render the current Yjs state to static HTML and store as `PagePublishedHtml` (or render on demand at `/p/[slug]` via SSR — pick SSR for simplicity, with HTTP cache headers + revalidate-on-publish). Public route is unauthenticated, has no chrome — just title, content, "Made with PRDMaker" footer.
  - **Files**:
    - `prisma/schema.prisma`: add fields to Page
    - `src/app/(authed)/[workspaceSlug]/p/[pageId]/components/publish-popover.tsx`
    - `src/app/(authed)/[workspaceSlug]/p/[pageId]/actions.ts`: publish/unpublish
    - `src/app/p/[slug]/page.tsx`: public renderer (SSR)
    - `src/app/p/[slug]/layout.tsx`: minimal chrome
    - `src/lib/render-page.ts`: Yjs/JSON → HTML
    - `src/lib/plan-gate.ts`: blocks publish on Free tier (used in Step 25)
  - **Step Dependencies**: Step 12
  - **User Instructions**: Run `npx prisma migrate dev --name publishing`.

## Billing

- [ ] Step 24: Stripe — products, prices, checkout, customer portal, webhooks
  - **Task**: Provision Stripe products in code via a one-time bootstrap script (Pro $15/seat, Business $25/seat — monthly + annual). Add `Subscription` Prisma model linked to Workspace (stripeCustomerId, stripeSubscriptionId, plan enum FREE/PRO/BUSINESS, status, currentPeriodEnd, seats, billingInterval). Build `/app/[workspaceSlug]/settings/billing` with current plan, upgrade buttons (Stripe Checkout), manage button (Customer Portal). Webhook handler at `/api/stripe/webhook` updates `Subscription` on `customer.subscription.*` events and on every member add/remove syncs seat count via Stripe `subscription_items.update`.
  - **Files**:
    - `prisma/schema.prisma`: Subscription, Plan enum
    - `scripts/bootstrap-stripe.ts`: idempotent product/price creation
    - `src/lib/stripe.ts`: client + helpers
    - `src/app/(authed)/[workspaceSlug]/settings/billing/page.tsx`
    - `src/app/(authed)/[workspaceSlug]/settings/billing/actions.ts`: createCheckout, openPortal
    - `src/app/api/stripe/webhook/route.ts`: webhook handler
    - `src/lib/seats.ts`: syncSeatCount(workspaceId)
    - `src/app/(authed)/[workspaceSlug]/settings/members/actions.ts`: call syncSeatCount on add/remove
    - `package.json`: `stripe`
  - **Step Dependencies**: Step 6
  - **User Instructions**: Create a Stripe account in test mode. Run `npm run stripe:bootstrap` to create products/prices and capture their IDs into `.env.local`. Set up the webhook in the Stripe dashboard pointing at `https://<your-domain>/api/stripe/webhook` and copy the signing secret to `STRIPE_WEBHOOK_SECRET`. For local dev, run `stripe listen --forward-to localhost:3000/api/stripe/webhook`.

- [ ] Step 25: Plan-gating across the app
  - **Task**: Centralize plan limits in `src/lib/plan-gate.ts`: Free → 1 workspace per owner, ≤3 members, ≤10 PRDs, no public publishing, history capped to 7 days. Pro → unlimited everything except SSO/per-page ACLs. Business → all. Apply gates in: workspace creation, member invite, page creation, publish action, history query, ACL UI. Show upgrade CTAs in-product when a gate trips.
  - **Files**:
    - `src/lib/plan-gate.ts`: rules + `assert*` helpers
    - `src/components/upgrade-cta.tsx`
    - `src/app/(authed)/onboarding/actions.ts`: assertCanCreateWorkspace
    - `src/app/(authed)/[workspaceSlug]/settings/members/actions.ts`: assertCanInvite
    - `src/lib/pages.ts`: assertCanCreatePage
    - `src/app/(authed)/[workspaceSlug]/p/[pageId]/actions.ts`: assertCanPublish
    - `src/app/api/pages/[pageId]/versions/route.ts`: filter by plan window
  - **Step Dependencies**: Step 24, Step 23
  - **User Instructions**: none

## Enterprise — Per-Page ACLs & SSO

- [ ] Step 26: Per-page ACLs (Business tier)
  - **Task**: UI on each page (Share popover) for Business workspaces only: add specific users with role override, or "Restrict to selected members." Backend: `requirePageAccess(pageId, userId)` checks `PagePermission` first, then falls back to workspace role. Surfaced everywhere page reads happen (API, server actions, public-publish authorization).
  - **Files**:
    - `src/components/page/share-popover.tsx`
    - `src/app/api/pages/[pageId]/permissions/route.ts`
    - `src/lib/permissions.ts`: extend with per-page logic
    - `src/lib/plan-gate.ts`: gate the UI to Business
  - **Step Dependencies**: Step 25
  - **User Instructions**: none

- [ ] Step 27: SSO / SAML for Business workspaces (SAML Jackson)
  - **Task**: Integrate `@boxyhq/saml-jackson` as an Auth.js provider, configurable per workspace. Settings page `/app/[workspaceSlug]/settings/sso` (Business only) for SP/IdP metadata exchange. Sign-in page detects workspace from email domain and routes to the SSO flow when configured.
  - **Files**:
    - `src/auth.ts`: register SAML provider
    - `src/lib/sso.ts`: jackson client
    - `src/app/(authed)/[workspaceSlug]/settings/sso/page.tsx`
    - `src/app/(authed)/[workspaceSlug]/settings/sso/actions.ts`
    - `src/app/api/sso/[...slug]/route.ts`: jackson HTTP routes
    - `src/app/(auth)/sign-in/page.tsx`: domain → SSO redirect
    - `prisma/schema.prisma`: SamlConfig (workspaceId, metadata, enabled)
    - `package.json`: `@boxyhq/saml-jackson`
  - **Step Dependencies**: Step 25
  - **User Instructions**: For testing, set up a free Auth0 or Okta dev tenant with a SAML app. Run `npx prisma migrate dev --name saml`.

## Compliance & GDPR

- [ ] Step 28: Audit log
  - **Task**: Add `AuditEvent` model (workspaceId, actorId, action, target, meta, createdAt). Emit events from all sensitive server actions: invite, role change, page delete/restore, publish/unpublish, billing change, SSO config change, API-key add/remove. Surface read-only audit log at `/app/[workspaceSlug]/settings/audit-log` (Business tier, infinite-scroll, filterable).
  - **Files**:
    - `prisma/schema.prisma`: AuditEvent
    - `src/lib/audit.ts`: emit() helper
    - `src/app/(authed)/[workspaceSlug]/settings/audit-log/page.tsx`
    - `src/app/api/workspaces/[workspaceId]/audit-log/route.ts`
    - `src/app/(authed)/[workspaceSlug]/settings/members/actions.ts`: audit emits
    - `src/app/(authed)/[workspaceSlug]/settings/billing/actions.ts`: audit emits
    - `src/app/(authed)/[workspaceSlug]/p/[pageId]/actions.ts`: audit emits
  - **Step Dependencies**: Step 24
  - **User Instructions**: Run `npx prisma migrate dev --name audit_log`.

- [ ] Step 29: GDPR — data export & full account deletion
  - **Task**: `/app/account/privacy` with two actions: (1) Export — generate a ZIP containing user profile JSON, all owned workspaces' content (pages, comments, versions) as JSON + Markdown, queued via background job, emailed when ready. (2) Delete account — hard-delete user, transfer-or-delete owned workspaces (UI prompts for choice), revoke all sessions, delete encrypted API key. Surface a 14-day cancel-deletion grace period.
  - **Files**:
    - `src/app/(authed)/account/privacy/page.tsx`
    - `src/app/(authed)/account/privacy/actions.ts`
    - `src/lib/export.ts`: zipper
    - `src/lib/delete-account.ts`: cascading delete
    - `src/app/api/cron/process-exports/route.ts`: scheduled processor
    - `src/app/api/cron/finalize-deletions/route.ts`: scheduled finalizer
    - `vercel.json`: register the two crons
  - **Step Dependencies**: Step 28
  - **User Instructions**: none

## Exports, Embeds, Mobile, Polish

- [x] Step 30: Export to Markdown, HTML, and PDF
  - **Task**: Top-bar "Export" menu with three formats. Markdown via `prosemirror-markdown` serializer with custom rules for embeds and page-links. HTML via the same renderer used for public publishing. PDF server-side via `@react-pdf/renderer` mapping the JSON tree to PDF primitives.
  - **Files**:
    - `src/lib/export-markdown.ts`
    - `src/lib/export-html.ts`
    - `src/lib/export-pdf.tsx`: react-pdf templates
    - `src/app/api/pages/[pageId]/export/[format]/route.ts`
    - `src/components/page/export-menu.tsx`
    - `package.json`: `prosemirror-markdown`, `@react-pdf/renderer`
  - **Step Dependencies**: Step 23
  - **User Instructions**: none

- [x] Step 31: Embeds — Figma, Linear, Loom, YouTube, generic oEmbed
  - **Task**: Add an `Embed` TipTap node that resolves a pasted URL on the server via `/api/embeds/resolve` returning provider + iframe HTML or oEmbed payload. Custom resolvers for Figma (file URL → embed), Linear (issue link → preview card), Loom (video → iframe), YouTube. Generic oEmbed fallback. Render with sandboxed iframe and a "Copy link" affordance.
  - **Files**:
    - `src/components/editor/extensions/embed.ts`
    - `src/components/editor/extensions/embed-view.tsx`
    - `src/app/api/embeds/resolve/route.ts`
    - `src/lib/embeds/figma.ts`
    - `src/lib/embeds/linear.ts`
    - `src/lib/embeds/loom.ts`
    - `src/lib/embeds/youtube.ts`
    - `src/lib/embeds/oembed.ts`
  - **Step Dependencies**: Step 10
  - **User Instructions**: none

- [x] Step 32: Mobile responsive — read + comment only
  - **Task**: Below 768px the layout collapses: hamburger drawer for the page tree, top bar simplifies to title + back, AI panel hidden. Editor switches to `editable: false` with comment-add disabled (read-only). Public-published pages already mobile-friendly; verify and tune.
  - **Files**:
    - `src/app/(authed)/[workspaceSlug]/layout.tsx`: responsive grid
    - `src/components/app-shell/mobile-drawer.tsx`
    - `src/components/editor/editor.tsx`: read-only on mobile
    - `src/components/comments/comments-rail.tsx`: read-only on mobile
    - `src/app/p/[slug]/layout.tsx`: mobile tweaks
  - **Step Dependencies**: Step 14, Step 23
  - **User Instructions**: none

- [x] Step 33: Visual polish — Notion-like minimal aesthetic + dark mode QA
  - **Task**: Tighten typography (Inter, generous line-height, content max-width 740px), refine palette to near-monochrome with a single accent color, audit every screen in light + dark, fix contrast issues, add subtle motion (Framer Motion) on tree expand, panel slide, modal open. Use `next-themes` system/light/dark switcher in account menu.
  - **Files**:
    - `src/app/globals.css`: refined CSS variables for both themes
    - `tailwind.config.ts`: refined palette
    - `src/components/theme-toggle.tsx`
    - `src/components/app-shell/account-menu.tsx`: include toggle
    - `src/components/editor/editor.css`: prose styles
    - `src/components/motion.ts`: shared Framer variants
    - `package.json`: `framer-motion`
  - **Step Dependencies**: Step 32
  - **User Instructions**: Walk every page in both themes; file any contrast issues you spot.

## Marketing Surface

- [x] Step 34: Public marketing pages — landing, pricing, privacy, terms
  - **Task**: Build unauthenticated marketing pages: `/` landing (hero, three-pane product screenshot, AI panel demo, feature grid, CTA), `/pricing` (three-tier table matching Step 24), `/privacy`, `/terms`. SEO metadata and OpenGraph images.
  - **Files**:
    - `src/app/(marketing)/layout.tsx`
    - `src/app/(marketing)/page.tsx`
    - `src/app/(marketing)/pricing/page.tsx`
    - `src/app/(marketing)/privacy/page.tsx`
    - `src/app/(marketing)/terms/page.tsx`
    - `src/components/marketing/hero.tsx`
    - `src/components/marketing/feature-grid.tsx`
    - `src/components/marketing/pricing-table.tsx`
    - `public/og-default.png`
  - **Step Dependencies**: Step 33
  - **User Instructions**: none

## Beta Feedback — Tables & Agile Epics

> Added from beta-user feedback. Numbered 39–43 to keep Steps 1–38 (and their cross-references) stable; intended execution order is **Steps 39–43 before Step 35**. All five depend only on already-completed steps. The Epic feature is delivered in four slices: schema (40), workspace board (41), per-PRD properties (42), and an in-document story breakdown (43).

- [x] Step 39: Full table editing via hover grips
  - **Task**: Add Notion-style hover grips to editor tables. A ProseMirror plugin tracks the hovered cell and renders grip handles along the active table's row and column edges; clicking a grip opens a small popover menu (tippy.js, matching the slash-command / bubble-menu styling) with insert row above/below, insert column left/right, delete row, delete column, toggle header row, toggle header column, and delete table — all wired to the existing `@tiptap/extension-table` commands. Grips and menu are suppressed when the editor is not editable (read-only / mobile / public). No new table dependency is needed; this is only the missing UX layer over commands already available.
  - **Files**:
    - `src/components/editor/extensions/table-controls.ts`: ProseMirror plugin — hovered-cell tracking + row/column grip decorations, gated on `editor.isEditable`
    - `src/components/editor/extensions/table-controls-menu.tsx`: grip popover menu mapping actions to `editor.chain().focus().<command>().run()`
    - `src/components/editor/extensions.ts`: register the TableControls extension alongside the existing `Table`/`TableRow`/`TableHeader`/`TableCell`
    - `src/components/editor/editor.css`: grip handle, hover, and active-table styles (light/dark via design tokens)
  - **Step Dependencies**: Step 10
  - **User Instructions**: none

- [x] Step 40: Database schema for Epics and per-PRD agile metadata
  - **Task**: Add a workspace-scoped `Epic` model and agile fields on `Page`. `Epic`: id, workspaceId, `key` (human label e.g. `EPIC-1`, assigned on create in Step 41), name, description (nullable), `status` (`EpicStatus`), color, `position` (Float, fractional ordering like the page tree), createdById, archivedAt (nullable), timestamps; relations to `Workspace` (back-relation `epics`), `User` (relation `EpicCreatedBy`), and `Page[]`. New `Page` fields: `epicId` (nullable FK → Epic, `onDelete: SetNull`), `agileStatus` (`AgileStatus`, default `BACKLOG`), `priority` (`Priority`, nullable), `storyPoints` (Int, nullable), `targetSprint` (String, nullable), `assigneeId` (nullable FK → User, relation `PageAssignee`, `onDelete: SetNull`), `externalUrl` (String, nullable). Enums: `EpicStatus` (PLANNED, IN_PROGRESS, DONE), `AgileStatus` (BACKLOG, TODO, IN_PROGRESS, IN_REVIEW, DONE), `Priority` (LOW, MEDIUM, HIGH, URGENT). Indices: `Epic @@unique([workspaceId, key])`, `Epic @@index([workspaceId, status])`, `Page @@index([workspaceId, epicId])`. Add the matching back-relations on `User` (`assignedPages`, `epicsCreated`) and `Workspace` (`epics`).
  - **Files**:
    - `prisma/schema.prisma`: `Epic` model, `EpicStatus`/`AgileStatus`/`Priority` enums, new `Page` fields + relations, `User` and `Workspace` back-relations
    - `src/lib/agile.ts`: ordered status columns, status/priority label + color maps, and shared `Epic` / agile TS types
    - `src/lib/types.ts`: extend page/tree types with optional agile metadata where consumed
  - **Step Dependencies**: Step 7
  - **User Instructions**: Run `npx prisma migrate dev --name epics_and_agile`.

- [x] Step 41: Workspace Epics — list, Kanban board, and epic CRUD
  - **Task**: Add a workspace Epics surface at `/[workspaceSlug]/epics`. A Kanban board with columns by `EpicStatus` (Planned / In Progress / Done); each card shows the epic key, name, color, count of assigned PRDs, and a progress meter (share of its PRDs with `agileStatus = DONE`). Support create/edit/recolor/archive, drag-and-drop to change status and reorder within a column (fractional `position`, reusing the page-tree ordering approach in `src/lib/pages.ts`), and an epic detail panel listing the PRDs in the epic (each links to its page). Add an "Epics" entry to the app sidebar. Epic `key` is generated on create as `EPIC-<n>` (n = workspace epic count + 1, inside the create transaction). All reads/writes scope by workspace; create/edit/archive require `EDITOR`+ via `requireRole` (`src/lib/permissions.ts`). Reuse `@dnd-kit` (already used by the page tree).
  - **Files**:
    - `src/app/(authed)/[workspaceSlug]/epics/page.tsx`: board route (server-loads epics + rollups)
    - `src/components/epics/epics-board.tsx`: `@dnd-kit` Kanban columns + drag handlers
    - `src/components/epics/epic-card.tsx`: card with PRD count + progress meter
    - `src/components/epics/epic-dialog.tsx`: create/edit epic (name, description, color, status)
    - `src/components/epics/epic-detail.tsx`: panel listing the epic's PRDs
    - `src/app/api/workspaces/[workspaceId]/epics/route.ts`: GET list (+ board rollups), POST create
    - `src/app/api/workspaces/[workspaceId]/epics/[epicId]/route.ts`: PATCH (rename/recolor/status/position/archive), DELETE
    - `src/lib/epics.ts`: epic service — create-with-key, board query (PRD counts + % done), reorder math
    - `src/components/app-shell/sidebar.tsx`: add the "Epics" nav link
  - **Step Dependencies**: Step 40, Step 9
  - **User Instructions**: none

- [x] Step 42: Per-PRD agile properties bar
  - **Task**: Add a compact, inline-editable properties bar beneath the PRD title in the page editor exposing the page's agile metadata: Epic (searchable picker over workspace epics, with inline "create epic" via the Step 41 POST), status (`AgileStatus`), priority, story points, target sprint, assignee (workspace-member picker backed by the member-search API used by @mentions), and an external issue URL (Jira/Linear). Each field commits via `PATCH /api/pages/:id/agile`, scoped by workspace + `requireRole(EDITOR)`. The bar is read-only when the editor isn't editable and is omitted from public pages. Reuse existing popover/menu styling and the member-search endpoint from Step 14.
  - **Files**:
    - `src/components/page/agile-properties-bar.tsx`: properties strip with per-field popovers + status/priority chips (labels/colors from `src/lib/agile.ts`)
    - `src/components/page/epic-picker.tsx`: searchable epic select with inline create
    - `src/app/api/pages/[pageId]/agile/route.ts`: PATCH agile fields (zod-validated enums; writes scoped by role)
    - `src/app/(authed)/[workspaceSlug]/p/[pageId]/page-editor.tsx`: mount the bar under the title, passing `editable` + initial agile data
    - `src/app/(authed)/[workspaceSlug]/p/[pageId]/page.tsx`: load the page's agile fields + workspace epics for first paint
  - **Step Dependencies**: Step 40, Step 41
  - **User Instructions**: none

- [x] Step 43: In-document Epic / user-story breakdown block
  - **Task**: Add a TipTap "Epic" block, inserted via `/epic`, holding an epic goal/summary line and a managed list of user-story child nodes. Each user story captures a title plus optional As-a / I-want / So-that fields, acceptance criteria, story points, and a status chip; stories can be added, reordered, and removed. Implement as two TipTap nodes — an `epicBlock` container and `userStory` children — with React NodeViews for the editing UI. Content persists in `contentJson` / Yjs like any other block (no new DB model; this is a content breakdown, distinct from the page-level agile metadata in Step 42). Add serialization rules so publish and export don't drop the nodes. Read-only when the editor isn't editable.
  - **Files**:
    - `src/components/editor/extensions/epic-block.ts`: `epicBlock` + `userStory` node schemas and the `/epic` insert command
    - `src/components/editor/extensions/epic-block-view.tsx`: React NodeView for the epic container (header + story list + "add story")
    - `src/components/editor/extensions/user-story-view.tsx`: React NodeView for a single story (fields, points, status chip, remove)
    - `src/components/editor/extensions.ts`: register the new nodes
    - `src/components/editor/slash-items.ts`: add the "Epic" slash item
    - `src/components/editor/editor.css`: epic-block + user-story styles (light/dark)
    - `src/lib/render-page.ts`, `src/lib/export-markdown.ts`, `src/lib/export-html.ts`: render/serialize the new nodes for publish + export
  - **Step Dependencies**: Step 10
  - **User Instructions**: none

## Roles & Bulk Import — Feature Catalog

> Added after the AI Workspace Agent plan (`ai_development_plan.md`, Steps 44–54). Numbered **55–56** to continue the shared step-number space (1–38 core, 39–43 beta, 44–54 agent) so existing cross-references stay stable. Intended order: **Step 55 before 56** — the bulk import is gated to the new Dev Lead role. Both build on the workspace feature graph from `ai_development_plan.md` Steps 44–46.

- [x] Step 55: Dev Lead role
  - **Task**: Add a `DEV_LEAD` value to the `Role` enum — an elevated editor that owns the application's feature catalog (and is the gate for bulk import in Step 56), ranked between EDITOR and OWNER. Update `ROLE_RANK` in `src/lib/config.ts` to `VIEWER:1, EDITOR:2, DEV_LEAD:3, OWNER:4`, add `DEV_LEAD` to the `ROLES` tuple, and add a "Dev Lead" label wherever roles render. Because `requireRole` is rank-based (`ROLE_RANK[role] < ROLE_RANK[min]`), every existing check stays correct with no logic change: each `requireRole(EDITOR)` path now also admits Dev Leads, each `requireRole(OWNER)` path still excludes them, and a **new `requireRole(DEV_LEAD)` tier admits exactly OWNER + DEV_LEAD** (used by Step 56). Extend the members role picker and the invite role selector (Step 6) to offer Dev Lead, with the rule that **only an OWNER may assign DEV_LEAD or OWNER** while a DEV_LEAD may manage EDITOR/VIEWER (prevents privilege escalation). A Dev Lead is a billable seat exactly like an Editor — Step 24 seat sync counts all members, so it needs no change. Audit role-label rendering (member list, presence, role chips) for the new value.
  - **Files**:
    - `prisma/schema.prisma`: add `DEV_LEAD` to the `Role` enum
    - `src/lib/config.ts`: `ROLES` tuple + `ROLE_RANK` (insert `DEV_LEAD` at rank 3) + role-label map
    - `src/app/(authed)/[workspaceSlug]/settings/members/page.tsx` + `actions.ts`: offer Dev Lead in the role picker; restrict assigning `DEV_LEAD`/`OWNER` to owners
    - `src/app/(authed)/[workspaceSlug]/settings/invites/page.tsx` + `actions.ts`: Dev Lead as an invitable role (owner-gated)
    - `src/lib/workspace.ts`, `src/lib/permissions.ts`: confirm rank-based `requireRole` covers the new tier (no logic change expected)
  - **Step Dependencies**: Step 3, Step 6
  - **User Instructions**: Run `npx prisma migrate dev --name dev_lead_role`. (Postgres adds an enum value in its own statement; if `migrate dev` flags altering an enum inside a transaction, accept the generated split migration.)
  - **Build notes (delivered)**: Migration `20260618081828_dev_lead_role` is a clean one-liner (`ALTER TYPE "Role" ADD VALUE 'DEV_LEAD'`) — applied without the transaction caveat on PG16 (it'll apply the same in prod via `migrate deploy`). Schema enum + `config.ts` `ROLES`/`ROLE_RANK` (DEV_LEAD at rank 3, between EDITOR=2 and OWNER=4) updated; because `requireRole` is rank-based, no existing permission check changed. **Deviation from the plan text, flag for review:** the role-label map went into a **new client-safe `src/lib/roles.ts`** (`ROLE_LABELS` + `ASSIGNABLE_ROLES`) rather than `config.ts`, because `config.ts` imports `@/env` and the styling convention forbids `@/lib/config` in client components (the member-row badge and both pickers are client components). And I **kept team management OWNER-only** — the plan line "a DEV_LEAD may manage EDITOR/VIEWER" was deliberately NOT implemented: granting a non-owner member-management powers is a security-sensitive expansion the user didn't explicitly request, so DEV_LEAD's only new capability is being the gate for Step 56 import (it's otherwise an elevated editor). OWNER can now assign the Dev Lead role; the role/invite pickers list it; the read-only badge renders "Dev Lead" (accentSubtle). The `changeMemberRole`/`createInvite` actions needed no logic change (already OWNER-gated; `Role` now includes DEV_LEAD). Verified: `tsc`, eslint, full `next build` (confirms `roles.ts` is client-safe — no config/env leak into the client bundle), and a live run — promoted a member to Dev Lead through the picker, confirmed it persisted to the DB, then reverted the test change.

- [x] Step 56: Import feature catalog from JSON (OWNER + Dev Lead)
  - **Task**: Add a bulk **import** path that populates the workspace feature graph (`ai_development_plan.md` Steps 44–46) from a single JSON document mapping features onto each stack — a deliberate, human-curated alternative to agent extraction (Step 49). Gated to **OWNER + DEV_LEAD** via `requireRole(DEV_LEAD)` (Step 55): imported rows are written **canonical** (features `ACTIVE`/`MANUAL`, links `CONFIRMED`/`MANUAL`) and therefore **bypass the Step 50 review queue**, so the bulk write is restricted to the roles trusted to own the catalog. **JSON shape**: a top-level `stacks[]` — each with `name`, `type` (∈ `StackType`), optional `description`, and `features[]` of `{ name, summary }` — plus a top-level `links[]` of `{ from, to, kind (∈ `FeatureLinkKind`), rationale? }` referencing features by name, with optional `fromStack`/`toStack` qualifiers to disambiguate names shared across stacks. **Behavior**: auto-create missing stacks (matched by name, case-insensitive; created with the given `type`); **idempotent** — features reuse the existing per-stack normalized-name match (`normalizeFeatureName`) instead of duplicating, and links promote-in-place / skip existing `(from,to,kind)` triples; the whole apply runs in one transaction so a validation failure changes nothing. Validate with a zod contract that returns precise errors (unknown stack type, bad link kind, dangling/ambiguous link target). Return a summary `{ stacksCreated, featuresCreated, featuresReused, linksCreated, linksSkipped, errors[] }`. **UI**: an "Import" button on the Features surface (List tab), shown only when `canImport` (server-passed, `ROLE_RANK[role] >= ROLE_RANK[DEV_LEAD]`), opening a dialog to paste JSON or upload a `.json` file and then showing the summary; refresh the graph on success. Optional companion **"Export to JSON"** in the same shape (same role gate) for round-trip/backup.
  - **Files**:
    - `src/lib/agent/import.ts`: zod payload contract + `importFeatureGraph({ workspaceId, actorRole, payload })` (validate → auto-create stacks → transactional canonical upserts of features + name-resolved links → summary)
    - `src/lib/agent/types.ts`: `FeatureImportPayload` + `FeatureImportSummary` types
    - `src/app/api/workspaces/[workspaceId]/features/import/route.ts`: POST — `requireRole(DEV_LEAD)` + `assertWorkspaceAgent`, body = payload, returns the summary
    - `src/components/agent/import-dialog.tsx`: paste/upload + validation-error + summary UI
    - `src/components/agent/features-surface.tsx`: "Import" button gated by `canImport`
    - `src/app/(authed)/[workspaceSlug]/features/page.tsx`: compute + pass `canImport`
    - (optional) `src/app/api/workspaces/[workspaceId]/features/export/route.ts` + export button
  - **Step Dependencies**: Step 55; `ai_development_plan.md` Step 45 (stacks) + Step 46 (feature graph services)
  - **User Instructions**: none
  - **Build notes (delivered)**: Shipped as specced, **including the optional export** (the GET on the same route returns the importable JSON shape with `Content-Disposition: attachment`, so import/export round-trips). `src/lib/agent/import.ts`: zod contract (`featureImportSchema`) + `importFeatureGraph` — structural validation fails before any write (returns `{ok:false, issues}`); the apply runs in one `$transaction` (auto-create missing stacks by case-insensitive name with fractional position; reuse active features by per-stack `normalizeFeatureName`; promote-in-place or skip existing link triples) and writes canonical rows (features ACTIVE/MANUAL, links CONFIRMED/MANUAL); per-link semantic problems (dangling target, ambiguous name needing a `fromStack`/`toStack`, self-link) are collected as **non-fatal** `summary.errors[]` so one bad link doesn't block the rest. Role gate is defense-in-depth: `requireRole(DEV_LEAD)` in both the route and the service, plus `assertWorkspaceAgent`. UI: `import-dialog.tsx` (paste or upload `.json`, client-side JSON.parse for instant feedback, then a created/reused/skipped/warnings summary), and Import + Export buttons on the Features header shown only when `canImport` (server-passed `ROLE_RANK[role] >= ROLE_RANK[DEV_LEAD]`). The role-label map deviation from Step 55 holds (client-safe `roles.ts`); `FeatureImportSummary` lives in the client-safe `types.ts` while the zod payload type stays in the server-only `import.ts`. One Next constraint handled: removed a stray non-handler export from `route.ts` (App Router rejects those). Verified: `tsc`, eslint, full `next build` (import route registered), a **14-check service harness** against a throwaway workspace (forgot-password catalog: 3 stacks/5 features/3 links created; idempotent re-run = 5 reused + 3 skipped, zero duplication; EDITOR denied; dangling + ambiguous links reported; bad stack type → structural failure), and a **live UI run** — OWNER saw Import/Export, imported a throwaway catalog through the dialog (summary: 1 stack, 2 features, 1 link), confirmed the rows landed ACTIVE/MANUAL, then deleted the test stack. Screenshot: `feature-import.png`.

## AI Guidance — PRD Completeness Checklist

<brainstorming>
Scope was chosen explicitly by the user: **checklist + nudges only** — no AI-led interview, no full-screen creation wizard (both were considered and deliberately deferred). Chat stays user-driven and the Step 21 stage stepper is untouched; what's added is a per-PRD completeness rail so a PM always sees where they are and what's still missing — that is the step-by-step guidance.

- **The checklist target is the page's source template.** `Page.templateId` is recorded at create-from-template (Step 8's `createPage` already fetches the template to copy `contentJson` — it just never stored the id). Target = the template's headings; fallback = the document's own headings; when neither exists there is no target and the card offers "propose an outline", whose applied reply becomes the doc outline and bootstraps the checklist. Existing pages (templateId null) get the doc-outline fallback automatically — no backfill needed.
- **Evaluation is AI-judged, not heading-matched.** A heading can exist and still be empty, and content can cover a topic under a different heading — so completeness is one structured model call per check through `resolveAiClient` (BYO honored — interactive path; managed = `assertWithinQuota` + `recordUsage`), zod contract with the house single corrective retry, sanitized against the real target.
- **Latest-only persistence.** `GuideCheck` mirrors `ImpactAnalysis` conventions but keeps **one row per page** (`pageId @unique`, upserted per run): the checklist is "current state", not history. A FAILED run keeps the last good report so the card stays useful.
- **Triggers (user decision): on-demand + after AI applies.** The card's button, plus the existing `prdmaker:ai-apply-done` document event. Manual edits refresh via the button — no auto-check on save, so quota spend stays predictable.
- **Nudges ride existing machinery.** A gap's chip sends the model-provided nudge into the page chat; the reply carries Apply-to-page even in Chat mode (per-message flag) — snapshot-then-apply remains the only write path into the document.

Out of scope, recorded as conscious cuts (not omissions): the AI-led step-by-step interview (the natural v2 on top of this checklist), auto-check on manual saves, check history, and a per-PM default template preselected in the picker (small follow-up if wanted).
</brainstorming>

> Added after the Dev Lead / bulk-import block. Numbered **57–60** to continue the shared step-number space (1–38 core, 39–43 beta, 44–54 agent, 55–56 roles/import) so cross-references stay stable. Builds on Step 17 (templates), Steps 19–21 (AI resolver + panel chat + apply path), and the `ai_development_plan.md` Step 54 test harness. Intended order: sequential, 57 → 60.

- [x] Step 57: Guide schema + checklist target derivation
  - **Task**: Record which template a page was created from, and add the checklist-run model. `Page.templateId String?` with a `Template` relation (`onDelete: SetNull` — deleting a template must never touch pages) + `pages Page[]` back-relation on `Template` + `@@index([templateId])`; persist it in `createPage` (`src/lib/pages.ts` already fetches the template to copy `contentJson` — store the id alongside; blank pages stay null; existing rows are null and simply use the doc-outline fallback). New enum `GuideCheckStatus` (RUNNING / READY / FAILED) + model `GuideCheck` mirroring `ImpactAnalysis` conventions but **latest-only**: id, workspaceId, `pageId @unique` (one row per page, upserted per run), status, `report Json?`, `model String?` (nullable so FAILED rows persist even when client resolution itself fails — the Step 44 lesson), `error String?`, `createdById` + named `User` relation, createdAt, updatedAt; workspace/page FKs `onDelete: Cascade`; `@@index([workspaceId])`; back-relations on `Workspace`, `Page`, `User`. `src/lib/guide/types.ts` (client-safe, mirroring `src/lib/agent/types.ts` style): `GuideChecklistItem` `{key, heading, level}`, the `GuideCheckReport` JSON contract `{items: [{key, heading, status: "covered"|"partial"|"missing", note, nudge}], summary}` — item status is report-internal (not a DB enum, like `ImpactSeverity`) — plus status label/color maps and the route transport types. `src/lib/guide/checklist.ts` (server): `extractHeadings(contentJson)` — a TipTap-JSON walker (modeled on `src/lib/editor-text.ts`) returning ordered H1–H3 `{level, text}`, skipping empty/whitespace headings; `deriveChecklistTarget(page)` — **template headings first** (via `page.templateId` → `Template.contentJson`), **fallback to the document's own headings**, **null when neither yields items**; stable item keys = slugified heading text with `-2`-style suffixes for duplicates so re-checks line up across runs; cap ~20 items so check prompts stay bounded.
  - **Files**:
    - `prisma/schema.prisma`: `Page.templateId` + relation, `GuideCheckStatus`, `GuideCheck`, back-relations
    - `src/lib/pages.ts`: persist `templateId` in `createPage`
    - `src/lib/guide/types.ts`: report contract, transport types, label/color maps
    - `src/lib/guide/checklist.ts`: heading extraction + target derivation with stable keys
  - **Step Dependencies**: Step 8, Step 17
  - **User Instructions**: Run `npx prisma migrate dev --name guide_check`. (Done — applied during the build as `20260702084317_guide_check`; dev server restarted per the Step 48 lesson.)
  - **Build notes (delivered)**: Shipped as specced (executed after Step 61, whose `templateMissing` fallback it composes with: a vanished template leaves `templateId` null by construction — only a **resolved** template id is persisted). Schema: `Page.templateId` + `Template.pages` back-relation + `@@index([templateId])`, `onDelete: SetNull`; `GuideCheckStatus` + latest-only `GuideCheck` (`pageId @unique`, upserted per run, `model` nullable for FAILED-at-resolution rows, createdBy via named relation — ImpactAnalysis conventions throughout) with back-relations on Workspace/Page/User. `types.ts` additionally ships `GuideChecklistTarget` with a `source: "template" | "document"` discriminator (+ `templateName`) so the Step 59 card can say what it's measuring against, and the `GuideCheckSnapshot`/`GuideCheckPayload` transport shapes for Step 58. `checklist.ts`: recursive H1–H3 extraction (blank headings skipped, whitespace collapsed, headings never nest), keys via the existing client-safe `slugify` from `src/lib/slug.ts` (`-2` suffix on duplicates, `"section"` fallback for unslugifiable text), 20-item cap, and `deriveChecklistTarget` falling through template → document → null — including the stale-id case (a template deleted before SetNull propagates must not throw). Verified: `prisma validate` + migration applied, `tsc`, eslint, full `next build`, and a **16-check smoke run against the dev DB** (temporary `scripts/step57-smoke.ts`, deleted after): the real `sys-feature-prd` template extracts the intended target (Overview | Problem | Goals | Non-goals | Requirements | Success metrics | Open questions); key stability incl. duplicates; `createPage` persists `templateId` for template creates and null for blank; template/document/null derivation precedence; `GuideCheck` `@@unique` rejection, upsert-per-run, and cascade-on-page-delete — all throwaway rows cleaned.
  - **Task**: `src/lib/guide/prompts.ts` — pure/isomorphic like `ai-prompts.ts`: `buildGuideCheckPrompt(target, {title, text})` rendering the target items (key + heading) and the page's `contentText` (capped ~24k chars, matching extraction) with a strict JSON output contract; **reuse `parseModelJson` + `buildJsonRetryMessage` from `src/lib/agent/prompts.ts`** instead of re-implementing tolerant parsing/retry. `src/lib/guide/check.ts` (server-only) — `runGuideCheck({pageId, userId})`: page access re-checked via `getPageAccess`, **mirroring the `/api/agent/impact` gates exactly — VIEWER access to read (GET), EDITOR access to run (POST)** (a run spends quota and writes a row); derive the target — **when null, return a typed `no_target` result with no model call and no row write** (the card shows the outline CTA instead; no quota burned); upsert the RUNNING row; resolve the requester's client via `resolveAiClient` (**BYO works — this is an interactive path**; managed = `assertWithinQuota` up front, `recordUsage` after the call), one `temperature: 0` call, output-token-bounded (~2k); zod-validate with one corrective retry; **sanitize against the real target** — drop items whose key isn't in the target, restore target order, clamp status to the union, cap note/nudge lengths, and default a missing nudge to the deterministic `Draft the "<heading>" section of this PRD`; upsert READY with report + model id. **On failure upsert FAILED with the error but keep the previous report** (the report field is only overwritten on READY) so the card can show the stale-but-useful last result alongside the error. `src/app/api/guide/check/route.ts` — `runtime = "nodejs"`, `dynamic = "force-dynamic"`, `maxDuration = 60`; GET `?pageId=` returns the derived target + latest `GuideCheck` + quota/BYO info (so the card renders the item skeleton before any run); POST `{pageId}` runs a check and returns the updated row; 402 quota / 503 unavailable response shapes mirror `/api/agent/impact`.
  - **Files**:
    - `src/lib/guide/prompts.ts`: check prompt + JSON contract (reusing the agent JSON helpers)
    - `src/lib/guide/check.ts`: target → model call → sanitize → upsert lifecycle
    - `src/app/api/guide/check/route.ts`: GET latest + target, POST run
  - **Step Dependencies**: Step 57, Step 19; reuses `ai_development_plan.md` Step 47 JSON helpers
  - **User Instructions**: none

- [ ] Step 59: Checklist card + nudges in the AI panel
  - **Task**: `src/hooks/use-guide-check.ts` — GET on mount for the open page; `run()` POST with single-flight + running state; **auto re-check on the existing `prdmaker:ai-apply-done` document event** (the same event the guided-mode impact CTA listens to) so the checklist refreshes right after any AI apply; expose quota-exceeded state. `src/components/ai-panel/checklist-card.tsx` — collapsible card at the top of the panel in **page scope, both Chat and Guide modes** (the checklist is about the document, not the mode): header = progress ("4 of 7 covered", plus partial/missing counts) + a "Check completeness" button with spinner while RUNNING; expanded = item rows with status icon, heading, one-line note, and a **nudge chip on each non-covered item** that sends the item's nudge into the page chat; empty-target state = "No outline yet — ask me to propose one" chip (sends a canned outline request; applying the reply gives the document headings, which bootstraps the checklist); FAILED = stale report + compact error note; quota-blocked = compact out-of-credits note (the panel's `QuotaNotice` still owns the full blocked state). Motion via `pm-*` classes, token utility classes, no `@/lib/config` in client code. **Nudge replies are appliable in Chat mode too**: extend `use-ai-chat.ts`'s `send` with a client-side option that marks the resulting assistant reply appliable, and loosen the panel's `appliable` gate from `guided && …` to `(guided || m.appliable) && …` — a nudge-drafted section carries the Apply-to-page button (still snapshot-guarded) without making every chat answer appliable. Wire the card into `ai-panel.tsx`.
  - **Files**:
    - `src/hooks/use-guide-check.ts`: fetch/run/single-flight + apply-event re-check
    - `src/components/ai-panel/checklist-card.tsx`: progress header, item rows, nudge chips, empty/FAILED/quota states
    - `src/components/ai-panel/ai-panel.tsx`: mount the card in page scope; appliable-reply rendering
    - `src/hooks/use-ai-chat.ts`: appliable-reply send option
  - **Step Dependencies**: Step 58, Step 20, Step 21
  - **User Instructions**: none

- [ ] Step 60: Guide test coverage
  - **Task**: Extend the `ai_development_plan.md` Step 54 Vitest harness. `tests/guide/checklist.test.ts` — heading extraction over TipTap JSON fixtures (H1–H3 only, empty-heading skip, item cap), target precedence (template → doc → null), stable keys including duplicate headings. `tests/guide/check.test.ts` — mocked Anthropic client (the `loop.test.ts` pattern): happy-path READY (sanitizer drops unknown keys, restores target order, applies the deterministic nudge fallback); corrective retry on malformed JSON; FAILED keeps the prior report; `no_target` short-circuits with zero model calls and zero rows; managed metering recorded per call vs BYO skip; **tenancy/page-access denial** (a workspace A user cannot check a workspace B page); latest-only upsert (a second run updates the same row, never inserts a sibling). `tests/guide/template-id.test.ts` — `createPage` persists `templateId` for template creation and null for blank; deleting the template SetNulls the pointer without touching the page. Extend `tests/factory.ts` with template + guide-check seed helpers.
  - **Files**:
    - `tests/guide/checklist.test.ts`: extraction + derivation + stable keys
    - `tests/guide/check.test.ts`: run lifecycle, sanitize, retry, metering, tenancy
    - `tests/guide/template-id.test.ts`: templateId persistence + SetNull
    - `tests/factory.ts`: template/guide seed helpers
  - **Step Dependencies**: Steps 57–58; `ai_development_plan.md` Step 54 (harness)
  - **User Instructions**: Have the dev Postgres container running; `npm test` runs the suite against the dedicated `prdmaker_test` database.

## Templates UX — Resilience & Picker Everywhere

> Cofounder-requested follow-ups to Step 17's templates, numbered **61–63** in the shared step space. Recorded next to the checklist block because they meet at `Page.templateId` (Step 57): applying a template to an empty page sets it, which is exactly what makes the Step 59 checklist light up. **Ordering**: Step 61 is independent and can run any time; Step 62 needs Step 57's migration (it writes `templateId`); Step 63 tests both.
>
> **Diagnosis behind item 1 (verified in code, lock as regression tests in Step 63):** a template is a **point-in-time copy** — `publishTemplateAction` copies `page.contentJson` at publish, so deleting/archiving the base page afterwards *cannot* blank it. What *can* produce a blank template is publishing from a page whose `contentJson` is still null/empty (content living only in the collab doc, publish before the first autosave): today `page.contentJson ?? EMPTY_DOC` silently bakes an empty template, and the blank surfaces later at create time — plausibly misattributed to the base-page deletion. Separately, `createPage` throws `"Template not found."` when the picked template row has vanished, instead of degrading to a blank page. Step 61 fixes both ends.

- [x] Step 61: Template resilience — trustworthy capture + graceful blank fallback
  - **Task**: **(1) Publish-time capture guard**: in `publishTemplateAction`, refuse to publish when the base page has no saved content — `contentJson` null **or** `extractText(contentJson)` blank (reuse `src/lib/editor-text.ts`) — returning a `pageId` fieldError ("That page has no saved content yet — open it, add content, and try again."), so silently-empty templates become impossible. Add a one-line semantics hint under the base-page picker in `templates-manager.tsx`: "Templates copy the page's current content — editing or deleting the page later won't change the template." **(2) Graceful blank fallback at create**: in `createPage`, when `templateId` is provided but the template row no longer exists, **create the blank page instead of throwing**, and return a `templateMissing` flag; thread the flag through the pages POST route and `use-page-tree.ts` so the sidebar can toast "That template no longer exists — created a blank page instead." (Once Step 57 lands, `templateId` stays null in this case.) A template belonging to another workspace keeps failing hard — tenancy violations are not a fallback case. **Verify the reported scenario end-to-end while here**: publish from a page with saved content → archive the base page → create from the template still carries the content.
  - **Files**:
    - `src/app/(authed)/[workspaceSlug]/settings/templates/actions.ts`: empty-capture refusal in `publishTemplateAction`
    - `src/app/(authed)/[workspaceSlug]/settings/templates/templates-manager.tsx`: semantics hint + surface the new field error
    - `src/lib/pages.ts`: missing-template → blank fallback + `templateMissing` flag
    - `src/app/api/workspaces/[workspaceId]/pages/route.ts`: pass the flag through
    - `src/hooks/use-page-tree.ts` + `src/components/app-shell/sidebar.tsx`: toast on `templateMissing`
  - **Step Dependencies**: Step 8, Step 17
  - **User Instructions**: none
  - **Build notes (delivered)**: Shipped as specced with one mechanism deviation: the missing-template notice uses the sidebar's existing `alert()` error pattern — the app has no toast system (only a reserved `--z-toast` token), and building one wasn't this step's scope. `publishTemplateAction` now refuses when the base page's `contentJson` is null or `extractText(contentJson)` is blank; the `?? EMPTY_DOC` fallback (the silent-blank-template bug) is deleted, the refusal lands as a `pageId` fieldError the manager's existing error line already renders, and the snapshot-semantics hint sits under the Base page select. `createPage` now returns `{ page, templateMissing }`: a vanished template degrades to a blank page with the flag set (threaded through the pages POST route and `use-page-tree`, alerted in the sidebar before navigation); cross-workspace ids still throw and system templates still resolve. Verified: `tsc`, eslint, full `next build`; the hint confirmed rendering live on `/settings/templates`; and an **18-check service smoke run against the dev DB** (temporary `scripts/step61-smoke.ts`, deleted after the run) — guard refuses blank/whitespace pages and passes content pages; plain create unchanged; valid workspace + system templates copy content with flag false; vanished template → page still created, blank, flag true; cross-workspace template throws `"Template not found."` with no page row created; and the regression pair: template content **survives base-page archive and hard delete**; all throwaway rows cleaned (verified zero leftovers). Not exercised live: the publish form click-through and the alert dialog itself — a third-party Chrome-extension debugger conflict blocked automated clicks/screenshots this session; both are thin wiring over the verified paths (the form's error line predates this step), and Step 63 locks them at the action/route level.

- [x] Step 62: Pick a template everywhere — child pages + empty pages (Confluence-style)
  - **Task**: **(a) Child creation goes through the picker**: replace `handleCreateChild`'s direct `createPage({parentId, title: "Untitled"})` in `page-tree.tsx` with the same `TemplatePicker` dialog the root "+" uses — one shared picker instance driven by a nullable `pendingParentId` (null = root), so root and child creation share the flow; "Blank page" stays the first, fastest option; keep the auto-expand + navigate behavior. **(b) Start-from-template on an existing empty page**: when the open page's saved doc is effectively empty (`extractText` blank) and the editor is editable, render a quiet affordance under the title — "Start from a template…" — opening the picker in a new **apply mode** (`mode: "create" | "apply"` prop: header "Apply a template", Blank option hidden). Selecting one runs two phases: (1) `POST /api/pages/[pageId]/apply-template` `{templateId}` — server verifies EDITOR page access + same-workspace (or system) template + that the **saved** content is still empty (409 otherwise), takes a MANUAL snapshot via the Step 15 helper (cheap insurance; also fires the Step 49 extraction hook), and sets `Page.templateId` (Step 57 field); then (2) the client plants the template's `contentJson` into the live editor doc — the same local-plant-then-Yjs-propagates mechanism `editor.tsx` already uses to hydrate template content on first open — and autosave persists it. Content never bypasses the collab doc; the server writes only metadata. Setting `templateId` here makes the Step 59 checklist immediately target the applied template's headings — the Confluence flow and the completeness rail meet. Never offered on non-empty docs or to viewers.
  - **Files**:
    - `src/components/app-shell/page-tree.tsx`: child "+" opens the shared picker (`pendingParentId`)
    - `src/components/app-shell/sidebar.tsx`: lift/share the picker flow for root + child
    - `src/components/templates/template-picker.tsx`: `mode` prop (apply header, hide Blank)
    - `src/components/page/start-from-template.tsx`: empty-page affordance + apply orchestration
    - `src/app/(authed)/[workspaceSlug]/p/[pageId]/page-editor.tsx`: mount the affordance; plant applied JSON into the editor
    - `src/app/api/pages/[pageId]/apply-template/route.ts`: POST — access + emptiness gate + MANUAL snapshot + set `templateId`
  - **Step Dependencies**: Step 17, Step 57 (writes `templateId`), Step 15 (snapshot helper)
  - **User Instructions**: none
  - **Build notes (delivered)**: Shipped as specced with two deviations, both flagged for review. **(1) Picker locality over "one shared instance":** the child-create picker lives inside `page-tree.tsx` (its own `pendingParentId`) rather than lifted to the sidebar — the tree owns the expand state the flow must touch, and both paths share the same `TemplatePicker` component, which is the sharing that matters; sidebar was untouched. Child-create errors now render inline in the picker (previously `alert`). **(2) Snapshot after plant, not before:** instead of the server taking a MANUAL snapshot of the (empty) pre-apply state, the flow mirrors the Step 53 AI-apply pattern exactly — the route only gates (401/404/403, 400, **409 when saved content is non-empty**, 404 cross-workspace) and records `templateId`, returning the template `contentJson`; the client plants it with `editor.commands.setContent` (the same call history-restore uses — y-prosemirror propagates in collab, solo autosave persists) and then fires `snapshotNow("MANUAL")`, so the snapshot captures the *applied* content and the Step 49 extraction hook runs against real text instead of an empty doc. One real bug found and fixed during live verification: with the collab server unreachable, a content page's Y.Doc stays unhydrated, so the live doc is transiently empty and the affordance showed on a non-empty page (server 409 still protected). `StartFromTemplate` now takes a `ready` prop — `initialContent == null || !collab || syncState === "connected"` — so blank pages trust emptiness immediately while content-bearing collab pages wait for sync. **Live-verified end-to-end in a real authed session (Playwright)**: child "+" opens the picker (not an instant blank); Blank creates a child under "Login Feature PRD"; the blank child shows "Start from a template…"; publish-from-that-blank-page is refused with the Step 61 field error (and the settings hint renders); apply-mode picker shows "Apply a template" with no Blank option; applying "Feature PRD" planted the full skeleton into the live editor and the affordance disappeared; DB confirmed `templateId=sys-feature-prd`, the MANUAL `PageVersion`, persisted `contentText`, and a QUEUED `EXTRACT_PAGE` job; apply on a content page → 409; after the `ready` fix the affordance is hidden on content pages while still showing on blank ones. All console errors were the pre-existing `ws://localhost:1234` collab-connection failures (Hocuspocus not running in dev) — none from the new code. Test pages hard-deleted after. `tsc`, eslint, full `next build` clean. (Housekeeping: `next build` shares `.next` with the dev server — building while dev runs corrupts it; clean `.next` + restart dev after building.)
  - **Post-ship fix (user-reported)**: applying a template to an existing doc whose content was just deleted always 409'd "This page already has content." Root cause: the route gated emptiness on **saved** `Page.contentJson`, but in collab mode that column is only an eventually-consistent projection — the Hocuspocus store hook persists `yDocState` alone and the solo autosave is disabled — so a just-cleared doc stays "non-empty" server-side indefinitely (in dev, forever: no snapshot cron). Fix follows the `/api/ai/apply` trust model: the affordance now sends `currentJson: editor.getJSON()` and the route judges emptiness on the client's live doc when provided (saved content remains the fallback for bodies without it); the server still writes no page content. Locked by two new route tests (stale-saved + empty-live → 200; empty-saved + non-empty-live → 409) written red-first, and **re-verified live with the collab server running** — seeded a page with saved content, select-all-deleted in the synced editor, applied "Bug Report": no 409, content planted, `templateId` + MANUAL snapshot persisted over the stale projection. Suite now 57/57.

- [x] Step 63: Template resilience + apply-flow test coverage
  - **Task**: Extend the Step 54 harness (template seed helpers arrive with Step 60's factory additions). `tests/templates/publish.test.ts` — empty-capture refusal (null `contentJson`; whitespace-only doc), successful publish copies content, and **the regression pair for the reported bug**: archive-or-delete the base page after publishing → the template still creates pages with content. `tests/templates/create-fallback.test.ts` — missing template → blank page created + `templateMissing` flag + null `templateId`; cross-workspace template still throws; child create persists `parentId` (+ `templateId` when given). `tests/templates/apply-template.test.ts` — sets `templateId` and snapshots only when saved content is empty; non-empty → 409; VIEWER → 403; cross-workspace/missing template → 404; a MANUAL snapshot row exists after success.
  - **Files**:
    - `tests/templates/publish.test.ts`: capture guard + snapshot-copy regression
    - `tests/templates/create-fallback.test.ts`: graceful blank + tenancy hard-fail
    - `tests/templates/apply-template.test.ts`: apply gates + metadata writes
  - **Step Dependencies**: Steps 61–62; `ai_development_plan.md` Step 54 (harness), Step 60 (factory seeds)
  - **User Instructions**: Same as Step 60 — dev Postgres running, `npm test`.
  - **Build notes (delivered)**: **18 new tests across the three planned files (20 after the post-ship 409 fix below), 57/57 green with the existing agent suite** (the harness auto-applied the `guide_check` migration to `prdmaker_test`). Two planned details shifted with the Step 62 deviations: the factory template seeds landed here (Step 60 will reuse them — `createTemplate` tracks system templates for cleanup since `workspaceId: null` escapes the workspace cascade, plus `docWithText`/`EMPTY_DOC` helpers), and `apply-template.test.ts` asserts the route's actual contract — gates + `templateId` + returned content, **including that the server writes no page content** — rather than a server-side snapshot row, since the MANUAL snapshot moved client-side (verified live in Step 62). Coverage: `publish.test.ts` mocks `@/lib/workspace` + `next/cache` at the module boundary (the `loop.test.ts` pattern) and locks the null-content and whitespace-only refusals, OWNER-only, capture-copies-content, and **the regression pair — the template survives base-page archive and hard delete**; `create-fallback.test.ts` locks vanished-template → blank + `templateMissing` + null `templateId`, cross-workspace hard-fail with no row created, system-template resolution, child `parentId`+`templateId` persistence, and template-delete SetNull leaving page content untouched; `apply-template.test.ts` mocks `@/auth` and covers 401/403(VIEWER)/400/409(non-empty, `templateId` untouched)/404(missing, cross-workspace, non-member) plus the empty-page happy path and system templates. Verified: `npm test` (55/55), `tsc --noEmit`, eslint — all clean.

## Testing

- [ ] Step 35: Unit + integration tests with Vitest
  - **Task**: Configure Vitest, set up Prisma test DB harness (Docker-based postgres). Cover: plan-gate logic, permissions resolver, AES-256-GCM round-trip, snapshot-before-AI guarantee, page tree reorder math, search query builder, Stripe webhook handlers (with mocked events). Aim ~70% line coverage on `src/lib`.
  - **Files**:
    - `vitest.config.ts`
    - `tests/setup.ts`: test DB + helpers
    - `tests/lib/plan-gate.test.ts`
    - `tests/lib/permissions.test.ts`
    - `tests/lib/crypto.test.ts`
    - `tests/lib/snapshots.test.ts`
    - `tests/lib/pages-reorder.test.ts`
    - `tests/lib/search.test.ts`
    - `tests/api/stripe-webhook.test.ts`
    - `package.json`: vitest, @testcontainers/postgresql
  - **Step Dependencies**: Step 25
  - **User Instructions**: Have Docker running locally; `npm test` will spin up Postgres in a container.

- [ ] Step 36: End-to-end tests with Playwright
  - **Task**: Playwright suite covering the critical paths: sign in via magic link (intercept Resend), create workspace, create a page, edit content, invite a teammate (second browser context), see live cursors and concurrent edits, leave a comment + @mention, publish + view public page anonymously, upgrade plan via Stripe test card, configure SSO test config.
  - **Files**:
    - `playwright.config.ts`
    - `e2e/auth.spec.ts`
    - `e2e/workspace.spec.ts`
    - `e2e/editor.spec.ts`
    - `e2e/realtime.spec.ts`
    - `e2e/comments.spec.ts`
    - `e2e/publishing.spec.ts`
    - `e2e/billing.spec.ts`
    - `e2e/helpers/email.ts`: Resend test inbox tap
    - `package.json`: `@playwright/test`
  - **Step Dependencies**: Step 35
  - **User Instructions**: `npx playwright install`. Configure a Resend test domain or use the API's `inbox` mode for capturing magic links in tests.

## Deployment & Observability

- [x] Step 37: Deployment — Vercel (web) + Heroku (collab) + Neon (Postgres)
  - **Task**: Vercel project for the Next.js app (env vars piped from `.env.example`). Heroku app for `apps/collab` running the Docker image via the Container Registry, with config vars for `COLLAB_SECRET` and the DB URL. CI on push: GitHub Actions running typecheck → lint → unit → e2e (against a preview deploy). Production database on Neon with a separate branch for staging.
  - **Files**:
    - `vercel.json`: cron, redirects, headers
    - `apps/collab/heroku.yml`
    - `apps/collab/Dockerfile`
    - `.github/workflows/ci.yml`: typecheck, lint, unit, e2e
    - `.github/workflows/deploy.yml`: deploy on main
    - `scripts/db-migrate-deploy.sh`: prod migration runner
  - **Step Dependencies**: Step 36
  - **User Instructions**: Create Vercel project, Heroku app, Neon project. Add all env vars / config vars to each platform. Configure Stripe webhook to production URL. Configure Resend production domain DNS (SPF, DKIM, DMARC). Point your domain DNS at Vercel. Smoke-test sign-in, page creation, multiplayer, AI, publish, billing checkout against production with a test Stripe card before announcing. Full runbook + env-var matrix + GitHub Actions secrets are in `deploy/vercel-heroku-neon.md`.
  - **Build notes (delivered)**: Added `apps/collab/heroku.yml`, `.github/workflows/ci.yml` + `deploy.yml`, `scripts/db-migrate-deploy.sh`, `.vercelignore`, and `deploy/vercel-heroku-neon.md`; expanded `vercel.json` with security headers. Vercel-serverless hardening applied to existing code so it actually runs on the platform: `runtime`/`maxDuration` on streaming + long-running routes (AI chat, AI apply, PDF export, embed resolve, cron sweep), `@react-pdf/renderer` added to `serverExternalPackages`, Prisma `rhel-openssl-3.0.x` engine target, `engines.node` pinned to 22.x, and the root `tsconfig` scoped away from `apps/` so the web type-check never depends on the collab package. Collab runs as a **single** Heroku web dyno built from `apps/collab/Dockerfile` via the Container Registry (Heroku proxies WebSockets natively; Hocuspocus binds `0.0.0.0`/`$PORT`, and its 30s ping keepalive clears Heroku's 55s idle-WS cutoff). Deviations from the task text: the web app is redeployed by **Vercel's Git integration**, so `deploy.yml` only runs prod migrations + the Heroku container release; CI runs typecheck/lint/build today with unit/e2e guarded by `--if-present` until Steps 35–36 land. **Run exactly one collab dyno** — there is no Hocuspocus Redis adapter, so a second dyno wouldn't share document state. The existing Docker/Caddy self-host path is left intact alongside this managed path. Verified: `prisma generate` (RHEL engine present), `next lint`, `tsc --noEmit` (web + collab), and a full `next build` all pass.

- [ ] Step 38: Observability — Sentry, structured logs, basic product analytics
  - **Task**: Wire Sentry (web + collab) for error tracking. Add structured logging via `pino` with a JSON transport for Vercel/Fly logs. Add PostHog (or Plausible) for product analytics on auth, workspace create, page create, AI message sent, publish, upgrade events. Add a `/api/health` endpoint for uptime monitoring.
  - **Files**:
    - `src/lib/logger.ts`: pino instance
    - `src/lib/analytics.ts`: PostHog client wrapper
    - `src/instrumentation.ts`: Sentry init for Next.js
    - `apps/collab/src/instrumentation.ts`: Sentry for collab
    - `src/app/api/health/route.ts`
    - `package.json`: `@sentry/nextjs`, `posthog-js`, `posthog-node`, `pino`, `pino-pretty`
  - **Step Dependencies**: Step 37
  - **User Instructions**: Create Sentry and PostHog projects (free tiers fine), add their DSNs/keys to Vercel + Fly env. Set up an uptime monitor (Better Stack, BetterUptime, or UptimeRobot) hitting `/api/health` every minute.

---

## Approach Summary

The plan front-loads the **spine** (auth → workspaces → page tree → editor → real-time collab) so a useful product exists by Step 13. Subsequent sections layer in differentiated features: comments, version history, templates, the AI assistant — each building on a stable spine without disturbing it. Commercial concerns (billing, SSO, ACLs) come after product is functional, then compliance, then mobile + polish, then marketing pages, then tests, then deploy + observability.

**Key implementation considerations the code-gen system should keep in mind:**

1. **Tenancy is non-negotiable.** Every domain query must scope by `workspaceId`. Add a server helper (`requireWorkspace`) early and use it everywhere — bugs here are critical security holes.
2. **The AI snapshot guarantee is a hard invariant.** Step 21's "snapshot-then-apply" must be atomic; an AI write that didn't snapshot first is a regression-from-the-spec bug.
3. **Yjs is the source of truth for live content.** The Postgres `Page.contentJson` / `contentText` is a derived projection used for search and rendering. Don't write to it independent of the Yjs state — always derive.
4. **BYO API keys are sensitive.** They never leave the server in plaintext after save. The decrypt path runs only in server actions and API routes, never in client components.
5. **Plan gates fail closed.** Default state is "blocked"; explicit checks unlock. A future feature added without thinking about gates will safely refuse to function on Free.
6. **Per-step file budget held.** Most steps modify ≤10 files; none exceed 20. If a generated step starts to exceed this, split it.
7. **Manual user steps are flagged.** Stripe products, SAML test IdP, Resend DNS, Vercel/Fly env, DNS — every external configuration is called out in the step's User Instructions.
