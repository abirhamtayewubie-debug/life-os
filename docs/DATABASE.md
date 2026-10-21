# Database

Postgres on Supabase. Everything is in versioned SQL under [`supabase/migrations`](../supabase/migrations). Apply locally with `npx supabase db reset --local`; verify isolation with `npm run test:db`.

## Conventions (every user-owned table)

| Rule | How |
|---|---|
| Ownership | `user_id uuid not null references auth.users on delete cascade` |
| Isolation | RLS **enabled and forced**; four owner policies on `(select auth.uid())` applied by `private.apply_owner_policies()` |
| No cross-user references | Parents expose `unique (id, user_id)`; children use composite FKs `(parent_id, user_id)`. `on delete set null (col)` clears only the reference. |
| Provenance | `source public.data_source` — `manual · imported · device · integration · estimate · ai_suggested · sample` |
| Timestamps | `created_at`, `updated_at` (trigger-maintained) |
| Soft delete | `archived_at` where users expect "archive" rather than delete |
| Validation | `check` constraints on lengths, ranges (ratings 1–10, mood 1–5), enums, date ordering |
| Money | `numeric(19,4)` + explicit `char(3)` currency. Transactions prove their currency matches the account via FK `(account_id, user_id, currency)`. |
| Time | Instants are `timestamptz`; local calendar days are `date`; recurring things store an IANA `timezone` + RFC 5545 RRULE. |

## Tables by migration

**0001 foundation** — `profiles` (auto-created on sign-up), `module_settings`, `dashboard_widgets`, `audit_events` (append-only for users), `tags`, `record_links` (generic backlinks).

**0002 planning** — `wheel_categories`, `goals` (self-referencing hierarchy: vision → long_term → annual → quarterly), `goal_progress_entries`, `projects`, `milestones`, `tasks` (subtasks via `parent_task_id`, date-only or instant due, RRULE), `task_tags`, `task_dependencies`, `calendar_events` (incl. time blocks, external ids for sync), `reminders`, `reminder_deliveries` (per channel, attempts, errors), `habits`, `habit_logs` (one row per habit per local date).

**0003 life** — `wheel_assessments`, `wheel_ratings` (score + desired score, no overall score), `daily_reviews` (morning/evening/weekly), `journal_entries` (private by default; `ai_access_allowed` can't be true while private), `notes` (+ generated `tsvector` full-text index), `note_tags`, `people`, `important_dates`, `learning_items`, `skills`.

**0004 finance** — `currencies` (reference: ETB, USD, CAD, EUR, GBP, KES, AED), `exchange_rates` (user-entered, dated), `financial_accounts`, `transaction_categories` (nested), `recurring_transactions` (bills/subscriptions; informational, never moves money), `transactions` (sign-checked by kind; transfers share `transfer_group_id`), `account_balance_snapshots`, view `account_balances` (`security_invoker`), `budgets`, `budget_lines`, `savings_goals`.

**0005 health** — `wellness_logs`, `sleep_logs` (generated duration; device rows must name the device), `workouts`, `workout_sets`, `body_measurements`, `hydration_logs`. No diagnostic fields.

**0006 AI, integrations, reports** — `ai_settings` (off by default, per-module opt-in), `ai_conversations`, `ai_messages`, `ai_tool_calls` (status incl. `pending_confirmation`), `integrations` (status, scopes, last sync, last error), `integration_credentials` (RLS on, **no** user policies, revoked from `anon`/`authenticated`), `reports` (stored measured facts kept apart from AI interpretation), function `purge_sample_data()`.

## Verified by `supabase/tests/rls_isolation.sql`

- Every `public` table has RLS enabled and forced.
- Sign-up creates a profile.
- A user cannot read, update, delete, or insert rows for another user.
- A user cannot link their record to another user's record (composite FK).
- Transaction currency must match its account; expense sign is enforced.
- Audit events can't be altered; integration credentials are unreadable.
- `purge_sample_data()` removes only the caller's `sample` rows.
- `anon` sees nothing except the currency list.

## Backups, export, deletion

- Supabase runs daily backups (Pro adds point-in-time recovery).
- Deleting an `auth.users` row cascades every owned row.
- User-facing export and account deletion ship in Phase 8; per-module CSV export ships with each module.
