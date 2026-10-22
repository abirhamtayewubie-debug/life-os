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

**0007 daily productivity** — `tasks.series_id` with a unique index allowing one open occurrence per series, RRULE shape checks, `saved_views` (per module, name unique ignoring case), `pg_trgm` title indexes on tasks, events and habits, triggers rejecting dependency cycles and subtask loops.

**0008 goals and life** — goal nesting trigger (strictly broader parent, no loops), `time_entries` (one running timer per user), `interactions` (+ trigger syncing `people.last_contacted_on`), `admin_items` (renewal/job need a date; documents and records don't), `personal_values`, `journal_entries.search` full-text index, `learning_items.notes`, one Wheel check-in per day.

**0009 record link cleanup** — trigger removing `record_links` rows (both directions) when a linked note, goal, project, task, person or journal entry is deleted.

**0010 finance operations** — functions `create_transfer()` (both legs in one transaction) and `record_recurring_payment()` (adds the payment, advances or closes the schedule), both `security invoker` so RLS applies; triggers deleting a transfer's other leg, guarding transfer legs against edits that would unbalance them, and checking category nesting, transaction category kind and budget line kind; bills/subscriptions must be negative; `exchange_rates_lookup_idx`, `budgets_user_idx`.

**0011 health and reports** — `profiles.measurement_system` (metric/imperial); `body_measurements` unit-per-metric and plausible-range checks plus a unique reading per (user, metric, moment, source); unique set numbers per exercise in a workout; `sleep_logs_user_date_idx`; `reports.measured` must be a JSON object and a report covers at most 366 days.

**0012 assistant** — `ai_settings` gains `model` (Haiku/Sonnet/Opus 5.5) and `monthly_budget_usd` (0–1000), and `allowed_modules` may only name known modules (health, finance and journal have their own switches); `ai_messages` cache token counts; `ai_tool_calls.result_record_id` and `tool_use_id`; `ai_briefings` (one per person per day, `facts` an object, source `ai_suggested`); `ai_usage` per call (purpose chat/briefing/report, non-negative tokens); `reports.interpretation_model` and `interpreted_at`, set together with the interpretation.

**0013 account deletion** — `delete_my_account()`: `security definer`, no arguments, deletes `auth.uid()` from `auth.users`; executable by `authenticated` only. Every user-owned table cascades from it.

Trigger helpers never call functions in schema `private`: app roles have no `usage` on it, so any such call from a trigger fails for signed-in users.

Calendar convention: timed events store real instants plus the zone they were created in, and repeats keep the local wall-clock time in that zone. All-day events are floating dates stored as UTC midnight of their first and last day (both inclusive), so `starts_at::date` is the date wherever the viewer is.

## Verified by `supabase/tests/rls_isolation.sql`, `productivity.sql`, `goals_life.sql`, `finance.sql`, `health.sql`, `assistant.sql` and `account.sql`

- Every `public` table has RLS enabled and forced.
- Sign-up creates a profile.
- A user cannot read, update, delete, or insert rows for another user.
- A user cannot link their record to another user's record (composite FK).
- Transaction currency must match its account; expense sign is enforced.
- Audit events can't be altered; integration credentials are unreadable.
- `purge_sample_data()` removes only the caller's `sample` rows.
- `anon` sees nothing except the currency list.
- Dependency cycles and subtask loops are refused; a repeating series has one open occurrence; malformed repeat rules are refused.
- An in-app reminder delivery is recorded once per occurrence.
- Saved views, dependencies, events, habits and deliveries are invisible to and unchangeable by another user.
- Goals nest only under broader goals; one running timer per person; last contact follows the newest interaction; undated renewals are refused; deleting a note removes its links.
- Goals, milestones, time entries, people, interactions, admin items, notes, journal entries, values, learning items and skills are invisible to and unchangeable by another user, who also can't attach rows to them.
- Transfers are written and deleted as a pair and can't be unbalanced by edits; categories nest one level under the same kind; budget limits are for spending categories; bills are money out and a recorded payment advances the schedule; one rate per currency pair per day; an imported row can't be imported twice into the same account.
- Accounts, balances, transactions, categories, budgets, bills and rates are invisible to and unchangeable by another user, including through `create_transfer()` and `record_recurring_payment()`.
- Body measurements need the right unit and a plausible value, and can't be recorded twice for the same moment; a manual night is logged once per date and must end after it starts, within a day; set numbers are unique per exercise; a check-in needs a rating; saved report facts are an object and span at most a year.
- Check-ins, water, workouts and sets, measurements, sleep and saved reports are invisible to and unchangeable by another user, who also can't attach sets to someone else's workout.
- The assistant is off with nothing shared by default; unknown models, modules or negative budgets are refused; a suggestion that needs confirmation can't be stored as done; one briefing a day; a journal entry can't be private and readable by the assistant at once.
- Assistant settings, conversations, suggestions, usage and briefings are invisible to and unchangeable by another user, who can't decide someone else's suggestion; deleting a conversation removes its messages and suggestions.
- Deleting an account is refused when signed out; it removes the caller's rows from every table (transfers, links and other trigger-guarded rows included) and leaves everyone else's alone.

## Backups, export, deletion

- Supabase runs daily backups (Pro adds point-in-time recovery).
- Deleting an `auth.users` row cascades every owned row.
- Export (JSON, zipped CSV, single-table CSV) and account deletion are in Settings → Your data. See [DEPLOYMENT.md](DEPLOYMENT.md) for backups and restore.
