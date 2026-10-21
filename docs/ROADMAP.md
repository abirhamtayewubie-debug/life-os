# Roadmap and implementation log

Each phase ships working software and must meet the Definition of Done (persists across refresh/re-login, real CRUD, validation, RLS-isolated, tested calculations, useful empty states, mobile layout, nothing invented).

| Phase | Scope | Status |
|---|---|---|
| 1 Foundation | Architecture, schema + RLS, design system, navigation, auth, Command Center with labelled sample data | **Done** (this log) |
| 2 Daily productivity | Tasks (subtasks, deps, tags, saved views), reminders with snooze, calendar day/week/month/agenda + time blocking + conflicts, habits CRUD, ⌘K record search, RRULE recurrence, time-zone tests | **Done** (merged, PR #1) |
| 3 Goals & life | Goals hierarchy + milestones, projects (Kanban/timeline), journal, knowledge base (search, backlinks, files), learning, relationships, home admin, Wheel of Life assessments | **Done** (merged, PR #2; file attachments wait for Storage) |
| 4 Finance | Accounts, transactions, transfers, budgets, bills/subscriptions, savings & debt, exchange rates, CSV import/export, monthly report | **Done** (PR for review) |
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

## Phase 2 log

- Migration `0007_daily_productivity`: `tasks.series_id` (one open occurrence per repeating series), RRULE shape checks on tasks/events/reminders, repeating tasks must have a due date, `saved_views`, trigram indexes for title search, triggers that refuse dependency cycles and subtask loops.
- `src/lib/recurrence.ts`: a small, tested RRULE subset (DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL, BYDAY, BYMONTHDAY, COUNT, UNTIL). Anything else is rejected, never guessed. Dates are evaluated locally and placed with `zonedTimeToUtc`, so "Mondays 09:00" stays 09:00 across DST.
- Tasks (`/tasks`): views (Today, Upcoming, Overdue, No date, All, Completed), search, priority/area/tag/project filters kept in the URL, saved views, create/edit/delete with confirmation, subtasks, "waiting on" dependencies, tags, estimates, today's focus, repeating tasks (completing one creates the next and keeps history).
- Reminders: set from a task, snooze (10 min, 1 hour, tomorrow), done (repeating reminders advance), remove. Alerts appear as in-app toasts while a Life OS tab is open, checked every minute; each occurrence is recorded once in `reminder_deliveries` so two tabs don't both alert. **Nothing reaches a phone or email yet** (phase 7), and the UI says so.
- Calendar (`/calendar`): day, week, month and agenda views; keyboard (←/→, t, d/w/m/a); events with repeat rules expanded per view; overlapping events flagged and laid out side by side; tasks due shown on their day; "Block time on calendar" from a task creates a linked time block. Deleting a repeating event deletes the series (single-occurrence exceptions are not built yet).
- Habits (`/habits`): set days or times-per-week, times per day, time of day; log any of the last 7 days (tap cycles counts); streak, 30-day/4-week consistency, 12-week history; pause/resume, archive/restore, delete with confirmation.
- ⌘K searches tasks, events and habits by title (as the signed-in user, so RLS applies), plus "New task / event / habit".
- The Command Center now expands repeating events too.
- Fixed (found while testing): stored sample data used fixed ids, so a second account couldn't load it. Stored samples now get random ids; demo mode keeps stable ones.
- Tests: 55 unit tests (adds recurrence, calendar expansion/DST/conflicts/layout, task filters, habit stats), `supabase/tests/productivity.sql` (cycles, series uniqueness, rule checks, view names, delivery idempotency, cross-user isolation for the new tables), and a Playwright flow covering tasks → reminder alert → repeating task → events + overlap → time block → habits → search → second user sees none of it.
- Known limits: no drag-and-drop on the calendar yet (use the event form), no per-occurrence edits of repeating events, reminders are in-app only, no external calendar sync (phase 7).


## Phase 4 log

- Migration `0010_finance_ops`: `create_transfer()` writes both legs of a transfer in one step (different accounts, positive amounts, equal amounts unless the currencies differ, where you enter what arrived); deleting either leg deletes the other; a leg can't be re-pointed at another account or turned into income or spending. `record_recurring_payment()` adds the payment (keeping a bill's direction even with a custom amount) and moves the due date on, closing the item once it passes its end date. Triggers keep sub-categories under a top-level category of the same kind, transactions in a category of the right kind, and budget limits on spending categories only. Bills and subscriptions must be money out.
- Finance (`/finance`) has seven tabs:
  - Overview: net worth in your base currency, accounts with balances, this month's income and spending per currency, budgets and the next two weeks of bills.
  - Transactions: month, account, category and search filters; add, edit and delete with confirmation; transfers; CSV import and export.
  - Budgets: weekly or monthly limits per spending category, with pace and over-limit flags.
  - Bills: due states, record a payment, skip a date, and a monthly-equivalent total labelled as an estimate.
  - Savings & debt: savings goals, optionally tracked from an account's balance and linked to a goal; cards and loans with a payoff estimate.
  - Monthly report: income, spending, what was kept, and categories compared with the previous month.
  - Accounts & setup: open, close and delete accounts; categories, with an optional starter set; exchange rates.
- Money is never added across currencies without a rate you entered. Each conversion uses the newest rate on or before that transaction's date and shows the rate date. Anything that can't be converted is listed separately and never guessed. Amounts are exact decimals (minor units), and an amount with more decimals than its currency allows (0.001 ETB) is refused.
- Liabilities (cards, loans) are stored as negative balances, so they subtract from net worth on their own. Paying one is a transfer, so it isn't counted as spending twice.
- CSV import runs in your browser. You choose the columns, the date format and the decimal mark, and can flip the signs. A preview shows each row and any line that can't be read (bad date, future date, too many decimals). Rows are saved in chunks with an external id, so importing the same file twice adds nothing. Imported rows are marked `imported`. Export downloads the current filter as a spreadsheet-safe CSV (formula cells are neutralised).
- Work & Projects: a project's budget now shows the spending tagged with that project, converted with your rates, with any unconverted currencies listed apart.
- ⌘K has a "New transaction" action. Sample data adds a dated USD→ETB rate, three bills/subscriptions and an emergency-fund goal, all marked Sample.
- Tests:
  - 88 unit tests. New ones cover rates (direct, inverse and dated), conversion and rounding, net worth with missing rates, budget periods and pace, the monthly report, schedules incl. month ends, savings, payoff estimates, CSV parsing and amounts, import validation and dedupe, and project spending.
  - `supabase/tests/finance.sql`: transfers, guards, category and budget rules, bill payments, duplicate rates and imports, and another person seeing or changing none of it, including through the functions.
  - A Playwright flow: accounts, a precision error, an expense, a transfer, net worth before and after adding a rate, a budget, paying a bill, the report, importing twice, export, and deleting a transfer.
- Known limits:
  - Rates are entered by hand; nothing is fetched online.
  - Bill reminders show in the app only (notifications arrive in phase 7).
  - A monthly bill due on the 31st moves to the 28th/30th after a short month and stays there; edit the date if that matters.
  - The payoff estimate assumes a fixed rate and no new borrowing.

## Phase 3 log

- Migration `0008_goals_and_life`: a trigger keeps goals nested strictly broader → narrower and refuses loops (and refuses re-levelling a goal above its own sub-goals); `time_entries` with at most one running timer per person; `interactions` with a trigger that keeps `people.last_contacted_on` in step; `admin_items` (renewals, documents, one-off jobs, records); `personal_values`; journal full-text search; one Wheel check-in per day.
- Migration `0009_record_link_cleanup`: `record_links` is polymorphic, so a trigger now removes a record's links when it is deleted (notes, goals, projects, tasks, people, journal entries).
- Goals (`/goals`): vision → long-term → this year → this quarter, sub-goals, numeric targets with a progress log, milestones, links to projects/tasks/habits/learning, achieve / pause / let go (kept in history). No goal score or ranking.
- Work (`/work`): projects with status, dates, goal and budget (recorded only; Finance links arrive in phase 4); milestones; a Kanban board (drag with mouse, touch or keyboard, or use the card menu) with quick add; a timeline; a timer and manual time entries with weekly totals.
- Wheel of Life (`/wheel`): pick or write areas, rate 1–10 now and wanted, radar of rated areas only, gaps and change per area, history per area. No overall score.
- Reflection (`/reflection`): private journal (journal, gratitude, reflection, prayer, meditation, intention) with optional mood, full-text search, writing streak and days written, and personal values. Entries are always saved private with AI access off; deleting one is audited by date only, never content.
- Knowledge Base (`/knowledge`): notes with type, folder, tags, link, pin, goal and project; full-text search; `[[Note title]]` links stored in `record_links` (both directions are re-synced on save, so renames are picked up), a "Linked from" panel, and a click on a missing link offers to create that note. **File attachments are not built**: they need Supabase Storage, which isn't enabled yet; the page says so.
- Learning (`/learning`): books, courses, videos, practice with status, progress, dates and goal; skills with a self-rated current and target level (1–5).
- Relationships (`/relationships`): people with private notes, birthday and a keep-in-touch rhythm; interaction log; "time to reach out" with a one-click task; important dates with yearly repeats (29 Feb falls on 28 Feb in common years) and the next 60 days listed.
- Home & Admin (`/admin`): renewals (Renewed moves a repeating renewal to its next date, or completes a one-off), documents with where they're kept, one-off jobs and records; household routines are the repeating Home-area tasks.
- Tasks and habits can now be linked to a goal from their forms, so the goal shows what's feeding it.
- ⌘K now also finds goals, projects, notes and people (journal entries are deliberately left out) and has quick actions for each new module.
- Fixed (found by the new database tests): the goal-nesting trigger called a helper in the `private` schema that signed-in users can't reach, so setting a parent goal would have failed. The check is now self-contained.
- Fixed: hover-only buttons (sub-goal, remove milestone, delete time entry, delete saved view) were invisible on touch screens; they now show unless the device has a mouse.
- Tests: 73 unit tests (adds goal tree and parents, metric percentages, time totals, Wheel comparison, journal streaks, wikilinks and tags, next occurrence incl. 29 Feb, keep-in-touch, renewals and month arithmetic), `supabase/tests/goals_life.sql`, and two Playwright flows (goals → projects board → Wheel; journal search → linked notes and backlinks → learning validation → relationships → renewals → a second user sees none of it).
- Known limits: no file attachments; dates and renewals are highlighted in the app only (no notifications until phase 7); project budgets aren't compared with spending until phase 4 (now done).
