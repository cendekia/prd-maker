<brainstorming>
The PRDMaker request is a substantial multi-tenant SaaS — Notion/Confluence-class editor, Yjs multiplayer, BYO-key AI panel, Stripe billing, magic-link/Google/SAML auth, GDPR-ready. The request didn't pin a stack, so I'll choose one that's idiomatic for this scope and that AI code generators can implement reliably:

- **Framework:** Next.js 15 (App Router), TypeScript, Tailwind v4, shadcn/ui
- **DB:** PostgreSQL via Prisma; hosted on Neon or Supabase
- **Auth:** Auth.js v5 with magic-link (Resend) + Google OAuth; SSO via SAML Jackson (BoxyHQ) gated to Business tier
- **Editor:** TipTap v2 + ProseMirror, with `y-prosemirror` binding
- **Real-time:** Yjs + Hocuspocus server (separate Node process) on Fly.io / Render; auth via JWT; persistence via Postgres
- **AI:** Anthropic SDK; user-supplied API key encrypted with AES-256-GCM using a server-side master key; streamed responses via Server-Sent Events
- **Billing:** Stripe (Checkout + Customer Portal + webhook); per-seat metered against workspace member count
- **Email:** Resend (magic links + notifications)
- **Search:** Postgres full-text search (tsvector + GIN); upgrade-path to Typesense if needed
- **Embeds:** oEmbed via iframely-compatible parser; manual handlers for Figma, Linear, Loom, YouTube
- **PDF export:** `@react-pdf/renderer` server-side
- **Hosting:** Next.js on Vercel; Hocuspocus on Fly.io; Postgres on Neon

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

- [ ] Step 20: AI side-panel chat — streaming, page context, quota enforcement
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

- [ ] Step 21: Guided Request → Plan → Spec workflow with safe AI writes into the page
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

- [ ] Step 37: Deployment — Vercel (web) + Fly.io (collab) + Neon (Postgres)
  - **Task**: Vercel project for the Next.js app (env vars piped from `.env.example`). Fly.io app for `apps/collab` with persistent volume + secrets for `COLLAB_SECRET` and DB URL. CI on push: GitHub Actions running typecheck → lint → unit → e2e (against a preview deploy). Production database on Neon with a separate branch for staging.
  - **Files**:
    - `vercel.json`: cron, redirects, headers
    - `apps/collab/fly.toml`
    - `apps/collab/Dockerfile`
    - `.github/workflows/ci.yml`: typecheck, lint, unit, e2e
    - `.github/workflows/deploy.yml`: deploy on main
    - `scripts/db-migrate-deploy.sh`: prod migration runner
  - **Step Dependencies**: Step 36
  - **User Instructions**: Create Vercel project, Fly.io app, Neon project. Add all env vars to each platform. Configure Stripe webhook to production URL. Configure Resend production domain DNS (SPF, DKIM, DMARC). Point your domain DNS at Vercel. Smoke-test sign-in, page creation, multiplayer, AI, publish, billing checkout against production with a test Stripe card before announcing.

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
