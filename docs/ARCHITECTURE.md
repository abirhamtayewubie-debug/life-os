# Life OS — Product Architecture

> Central principle: **understand my life, help me prioritize what matters, and turn goals into consistent action.**

This document is the source of truth for how the system is put together. It is deliberately concise; the schema lives in [`DATABASE.md`](./DATABASE.md), the visual language in [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md), and the delivery plan in [`ROADMAP.md`](./ROADMAP.md).

## 1. Shape of the system

```
┌──────────────────────────── Browser ────────────────────────────┐
│  Next.js App Router UI (React Server + Client Components)       │
│  shadcn-style primitives · Recharts · ⌘K command palette        │
└───────────────┬─────────────────────────────────────────────────┘
                │ HTTPS (session cookie, no secrets in the client)
┌───────────────▼──────────────── Next.js server ─────────────────┐
│  proxy.ts            → refreshes the Supabase session cookie    │
│  Server Components   → read through the Data Access Layer       │
│  Server Actions      → validate (zod) → authorize → mutate      │
│  assistant actions   → Anthropic + permissioned tools (server)  │
│  /api/cron/*         → (Phase 2/7) reminder dispatch, secret-auth│
└───────────────┬──────────────────────────────┬──────────────────┘
                │ user JWT (anon key + RLS)    │ Anthropic API key (server only)
┌───────────────▼───────────── Supabase ───────┴──────────────────┐
│  Postgres 17 · Row Level Security on every user table           │
│  Auth (email/password; OAuth providers later)                   │
│  Storage (Phase 3, private buckets, per-user paths)             │
│  pg_cron (Phase 2/7) for reminder scheduling                    │
└─────────────────────────────────────────────────────────────────┘
```

### Key decisions and trade-offs

| Decision | Why | Trade-off |
|---|---|---|
| **Next.js 16 App Router + TypeScript** | Server Components keep data access on the server; Server Actions give typed mutations without a separate API layer. | Tied to React/Next conventions; mitigated by keeping domain logic in plain TS modules. |
| **`cacheComponents` disabled** | Almost every screen is per-user and request-time. Turning off the new caching model keeps the mental model simple ("every request is fresh, RLS decides"). | We give up static-shell prefetching. Can be revisited once modules stabilise. |
| **Supabase (Postgres + Auth + RLS)** | Isolation is enforced by the database, not just app code. Managed backups, auth, storage, cron in one place. | Vendor coupling; mitigated because the schema is plain SQL migrations and the app talks to Postgres through one client module. |
| **Hand-authored shadcn-style components** | The shadcn registry is unreachable from this build environment, so components were written in the same open-code style on top of `radix-ui`. Same API, fully owned. | We maintain them ourselves (which is the shadcn model anyway). |
| **Recharts** | Composable, SVG, accessible enough with labelled axes and text alternatives. | Heavier than hand-rolled SVG; only loaded in client chart components. |
| **Demo mode when Supabase isn't configured** | The app is runnable and reviewable before any account exists. All demo data is generated in one module and labelled. | Two data paths for reads; kept small by a single `DashboardData` shape. |
| **Provenance on every record** (`source` column) | Requirement: distinguish real, manual, imported, device, estimated, AI-suggested and sample data. Enables "remove all sample data" with one query. | One extra column per table. |

## 2. Code organisation

```
src/
  app/
    (auth)/login, signup        public auth screens
    (app)/layout.tsx            authenticated shell: sidebar, top bar, ⌘K
    (app)/page.tsx              Life Command Center
    (app)/<module>/page.tsx     one route per module
    auth/callback/route.ts      email-confirmation code exchange
  components/
    ui/                         design-system primitives (button, card, dialog…)
    shell/                      sidebar, top bar, command palette, theme
    data/                       provenance badge, empty state, stat, charts
  features/
    dashboard/                  widgets, layout persistence, briefing, review
    settings/                   preferences, module visibility, data controls
  lib/
    modules.ts                  module registry (nav, icons, phase, status)
    supabase/                   browser / server clients, env detection
    dates.ts, money.ts          time-zone and decimal-safe helpers (tested)
    sample-data.ts              the ONLY place sample data is produced
  server/
    viewer.ts                   Data Access Layer entry: who is asking
    dashboard.ts                assembles DashboardData from Supabase or demo
    actions/                    server actions (validated, authorised)
supabase/
  migrations/                   versioned SQL; schema + RLS + functions
  tests/                        SQL tests for row isolation
```

Rules:
- **No module imports another module's internals.** Cross-module reads go through `src/server/*` services that return typed shapes.
- **Every mutation is a Server Action** that (1) re-reads the session, (2) validates with zod, (3) writes with the user-scoped client so RLS applies, (4) writes an `audit_events` row for sensitive actions.
- **The service-role key is never imported by UI code.** Only `/api/cron/*` (Phase 2+) may use it, guarded by `CRON_SECRET`.

## 3. Cross-module data model (summary)

Modules connect through foreign keys, not copies:

```
life vision → goals (self-referencing hierarchy) → projects → tasks → subtasks
                 │                                     │
                 ├── habits → habit_logs               ├── calendar_events (time blocks)
                 ├── wheel_categories ← wheel_ratings  └── reminders → reminder_deliveries
                 └── budgets / savings goals (finance)
journal_entries, notes ── link to goals / projects / tasks via record_links
```

Every user-owned row carries `user_id`, `source`, `created_at`, `updated_at`, and (where it makes sense) `archived_at`. Child rows reference parents by `(id, user_id)` composite foreign keys, so a row can never point at another user's record even if application code has a bug.

## 4. AI assistant architecture (Phase 6)

```
user question ─► sendMessage Server Action (server/actions/assistant.ts)
                   ├─ load user's AI preferences + per-module data permissions
                   ├─ build tool list = registry ∩ permitted modules
                   ├─ Anthropic Messages API (tool use), key from server env
                   │     └─ tool_use ─► tool runner
                   │           • read tools: run with the USER's RLS-scoped client
                   │           • write tools: never execute; create a
                   │             `pending_confirmation` row in ai_tool_calls
                   ├─ log every tool call (args hash, row counts, duration)
                   └─ answer with links to the records used
user taps "Confirm" ─► normal Server Action executes the proposal ─► audit_events
```

- The model never receives database credentials; tools are typed functions with zod-validated inputs and capped result sizes.
- Private journal and relationship notes are **excluded** from tools unless the user enables that scope explicitly, with a disclosure that the content is sent to Anthropic.
- Built as Server Actions rather than a route: `server/ai/run.ts` is the tool loop, `server/ai/tools.ts` the registry, `server/ai/account.ts` budget and rate limits (from `ai_usage`). Proposals are claimed with a conditional update so a double tap can't apply one twice, then applied by the same Server Actions the UI uses.
- Answers separate **Facts** (from records, with links), **Estimates**, and **Suggestions**, and state when data is missing or stale.

## 5. Reminders and notifications (Phase 2 / 7)

- `reminders.remind_at` is `timestamptz`; the user's IANA time zone is stored on the profile and on recurring rules so DST shifts are correct.
- A dispatcher (pg_cron → `/api/cron/reminders`, or Vercel Cron) claims due reminders with `FOR UPDATE SKIP LOCKED`, writes a `reminder_deliveries` row per channel, and retries with backoff.
- Built in Phase 2: in-app only. A client component polls `claimDueReminders` once a minute while a tab is visible; the unique `(reminder_id, channel, scheduled_for)` key makes each alert fire once across tabs. The server-side dispatcher below arrives with push/email in Phase 7.
- Channels: in-app is first. Web push and email are added only when configured **and** verified end-to-end; until then the UI says plainly that reminders only appear while the app is open.

## 6. Security posture

- RLS enabled on every table in `public`; default deny; policies key on `(select auth.uid())`.
- Composite FKs prevent cross-tenant references.
- Secrets only in server env (`.env.local`, Vercel env). `NEXT_PUBLIC_*` holds only the Supabase URL and publishable/anon key, which are safe by design because RLS gates them.
- Security headers (CSP-lite, frame-ancestors, referrer, permissions policy) in `next.config.ts`.
- Rate limiting on auth and AI routes (Phase 6) via a Postgres-backed token bucket.
- `audit_events` for sign-ins, exports, deletions, integration grants, AI-confirmed actions.
- Export (JSON/CSV) and full account deletion are user-initiated (Phase 8, with export of individual modules as they ship).

## 7. Environments and deployment

- **Local:** `npm run dev` with either demo mode or a local Supabase stack (`npx supabase start`).
- **Hosted (proposed, needs approval):** Vercel (Hobby/free) + Supabase (Free tier) to start; Anthropic API is usage-billed and will only be wired in Phase 6 after you approve it.
- Backups: Supabase daily backups (Pro tier adds PITR); plus user-level JSON export.
