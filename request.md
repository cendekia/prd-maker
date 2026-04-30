# PRDMaker

## Project Description
A SaaS web app for startup product teams (5–30 people) to author Product Requirements Documents in a Confluence-style interface, paired with an integrated AI assistant. Workspaces of users co-edit PRDs in real time, organize them in a hierarchical page tree, draft content via a side-panel AI that follows a guided Request → Plan → Spec workflow, and publish finished PRDs to public URLs. AI is BYO key — users supply their own Anthropic API key.

## Target Audience
- Startup product teams of ~5–30 people (PMs, engineers, designers)
- Use case: cross-functional collaboration on product specs
- Pricing sensitivity: per-seat in the $10–20/seat/month range

## Desired Features

### Page Management
- [ ] Confluence-style hierarchical page tree (parent/child pages)
- [ ] Create / rename / move (drag-and-drop reparent) / delete pages
- [ ] Workspace-wide full-text search across all PRDs

### Editor
- [ ] Rich-text WYSIWYG editor (headings, lists, tables, code blocks, images)
- [ ] Slash-command menu for inserting blocks
- [ ] `[[Page name]]` internal links between PRDs
- [ ] Embeds — Figma, Linear, Loom, YouTube, generic oEmbed
- [ ] Export to PDF, Markdown, and HTML

### Real-time Collaboration
- [ ] Multiplayer co-editing with CRDT-based sync (Yjs or equivalent)
- [ ] Live cursors and presence indicators showing who's viewing/editing
- [ ] Conflict-free concurrent edits
- [ ] WebSocket-based sync server

### Comments & Discussions
- [ ] Inline comments anchored to selected text
- [ ] Page-level comment thread
- [ ] Threaded replies, resolve / reopen
- [ ] @mentions notify the mentioned user

### Version History
- [ ] Auto-saved snapshots on a schedule and on major edits
- [ ] Side-by-side diff view between any two versions
- [ ] One-click restore to a previous version
- [ ] Snapshot taken before any AI-written edit so AI rewrites are always reversible

### Templates
- [ ] Pre-built starter templates: Feature PRD, Tech Spec, RFC, One-Pager, Bug Report
- [ ] Workspace-level custom templates (admin-published)
- [ ] "New page from template" picker

### Notifications
- [ ] In-app notification inbox
- [ ] Email notifications for mentions, comment replies, page shares, invites
- [ ] Per-user notification preferences

### AI Assistant
- [ ] Side-panel chat integrated with the currently active page
- [ ] Guided "Request → Plan → Spec" workflow using built-in prompt templates
- [ ] AI can write / update content directly into the page
- [ ] BYO Anthropic API key — stored encrypted per user, never shared across users
- [ ] In-app key management (add / rotate / remove key, test connection)

### Workspaces & Permissions
- [ ] Workspaces — users create or join; PRDs belong to a workspace
- [ ] Invite members via email
- [ ] Role-based access: owner / editor / viewer
- [ ] Per-page ACLs (Business tier only)

### Public Publishing
- [ ] One-click "Publish" → public read-only URL at `prdmaker.app/p/<slug>` (no login required to view)
- [ ] Optional custom slug
- [ ] Unpublish / revoke
- [ ] Custom domains (e.g. `docs.acme.com`) deferred to v1.1, Business-tier only

### Authentication
- [ ] **Magic link (passwordless email)** — primary sign-in method
- [ ] **Google OAuth** — one-click sign-in
- [ ] **SSO / SAML** — gated to Business-tier workspaces (Okta, Azure AD, Google Workspace SAML)
- [ ] No passwords stored

### Billing & Plans (Stripe)
- [ ] **Free** — 1 workspace, up to 3 members, up to 10 PRDs, 7-day version history, no public publishing
- [ ] **Pro — $15/seat/month** — unlimited workspaces, members, PRDs; full version history; public publishing; all editor features; AI panel
- [ ] **Business — $25/seat/month** — everything in Pro plus SSO/SAML, audit log, per-page ACLs, custom domains (v1.1), priority support
- [ ] Monthly + annual billing options
- [ ] In-app upgrade / downgrade / cancel flows

### Compliance & Data Handling
- [ ] GDPR-ready — user data export, full account deletion, configurable EU data residency
- [ ] Encryption at rest for PRD content and API keys
- [ ] Audit log surfaced to Business-tier admins (workspace events: invites, role changes, publishes, deletions)
- [ ] Privacy policy + terms of service pages

## Design Requests
- [ ] **Visual style: minimal & Notion-like** — generous whitespace, near-monochrome palette, subtle borders, sans-serif (Inter), content-first
- [ ] **Dark mode** at launch (system / light / dark toggle)
- [ ] **Three-pane app layout**: left page tree, center editor, right collapsible AI panel
- [ ] **Top bar**: breadcrumb, share/publish controls, presence avatars, workspace switcher
- [ ] **Cmd-K palette** for quick page navigation and slash commands
- [ ] **Mobile**: read-only on phone (view + comment); full editing is desktop-only at launch
- [ ] **Public published pages**: clean reader view, no chrome — just title + content + small "Made with PRDMaker" footer

## Other Notes
- SaaS — multi-tenant, hosted product
- AI cost is borne by the user (BYO Anthropic key); SaaS pricing covers platform/infra only
- Version history must snapshot before AI writes into a page, so AI rewrites are always reversible
- v1.1 deferred items: custom domains, GitHub OAuth, Microsoft OAuth, full mobile editing
- SOC2 Type II is not committed for v1 but the architecture (encryption at rest, audit logging, access controls) should not preclude it later
