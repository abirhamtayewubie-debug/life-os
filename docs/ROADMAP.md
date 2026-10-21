# Roadmap and implementation log

Each phase ships working software and must meet the Definition of Done (persists across refresh/re-login, real CRUD, validation, RLS-isolated, tested calculations, useful empty states, mobile layout, nothing invented).

| Phase | Scope | Status |
|---|---|---|
| 1 Foundation | Architecture, schema + RLS, design system, navigation, auth, Command Center with labelled sample data | **Done** (this log) |
| 2 Daily productivity | Tasks (subtasks, deps, tags, saved views), reminders with snooze, calendar day/week/month/agenda + time blocking + conflicts, habits CRUD, ⌘K record search, RRULE recurrence, time-zone tests | Next |
| 3 Goals & life | Goals hierarchy + milestones, projects (Kanban/timeline), journal, knowledge base (search, backlinks, files), learning, relationships, home admin, Wheel of Life assessments | |
| 4 Finance | Accounts, transactions, transfers, budgets, bills/subscriptions, savings & debt, exchange rates, CSV import/export, monthly report | |
| 5 Health & analytics | Workouts, measurements, sleep, wellness, reports (daily → annual) with measured vs interpreted split | |
| 6 AI assistant | Server-side Anthropic integration, permissioned read tools, confirm-before-write proposals, briefings and weekly reports | Needs approval (paid API) |
| 7 Integrations & notifications | Google/Outlook calendar (OAuth), web push, email, health imports, dispatcher with retries | Needs approval per service |
| 8 Quality & launch | Accessibility & security review, export/deletion, monitoring, backups, deployment docs | |

## Phase 1 log

- Next.js 16.4 (App Router, Turbopack), React 19.3, TypeScript strict, Tailwind 4. `cacheComponents` off (see ARCHITECTURE).
- shadcn registry unreachable from the build sandbox, so the shadcn-style primitives were written by hand on `radix-ui`.
- 6 migrations, ~45 tables, RLS forced everywhere; `supabase/tests/rls_isolation.sql` passes against Supabase's Postgres 17.
- Demo mode (no env) renders the Command Center from `src/lib/sample-data.ts`; live mode reads the same shapes from Supabase. One pure pipeline (`features/dashboard/compute.ts`) builds both.
- Working in Phase 1: sign up / sign in / sign out, session refresh in `proxy.ts`, Command Center (15 widgets), morning briefing, evening review (saved), complete tasks and habits from the dashboard, customise layout (reorder, resize, hide; saved per user), module visibility, preferences (time zone, currency, locale, week start), load/remove sample data, theme.
- Tests: 25 unit tests (money, time zones/DST, overdue logic, conflicts, habit consistency, sample labelling, layout), SQL isolation tests, Playwright end-to-end flow incl. a second user seeing nothing.
- Known limits: other modules are informational pages until their phase; reminders are in-app only; no export yet.
