# Roadmap and implementation log

Each phase ships working software and must meet the Definition of Done (persists across refresh/re-login, real CRUD, validation, RLS-isolated, tested calculations, useful empty states, mobile layout, nothing invented).

| Phase | Scope | Status |
|---|---|---|
| 1 Foundation | Architecture, schema + RLS, design system, navigation, auth, Command Center with labelled sample data | **Done** (this log) |
| 2 Daily productivity | Tasks (subtasks, deps, tags, saved views), reminders with snooze, calendar day/week/month/agenda + time blocking + conflicts, habits CRUD, ⌘K record search, RRULE recurrence, time-zone tests | **Done** (merged, PR #1) |
| 3 Goals & life | Goals hierarchy + milestones, projects (Kanban/timeline), journal, knowledge base (search, backlinks, files), learning, relationships, home admin, Wheel of Life assessments | **Done** (merged, PR #2; file attachments wait for Storage) |
| 4 Finance | Accounts, transactions, transfers, budgets, bills/subscriptions, savings & debt, exchange rates, CSV import/export, monthly report | **Done** (merged, PR #3) |
| 5 Health & analytics | Workouts, measurements, sleep, wellness, reports (daily → annual) with measured vs interpreted split | **Done** (merged, PR #4) |
| 6 AI assistant | Server-side Anthropic integration, permissioned read tools, confirm-before-write proposals, briefings and report readings | **Done** (merged, PR #5); not verified live: waits for an API key |
| 7 Integrations & notifications | Web push, reminder sender with retries, calendar files and subscribe link, Apple Health import, Integrations page; Google Calendar (OAuth) and email | **Built** (PR for review) except Google Calendar and email, which need accounts; not verified on real devices or in hosting |
| 8 Quality & launch | Accessibility & security review, export/deletion, monitoring, backups, deployment docs | **Built** (PR for review); hosting not set up (needs approval) |

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


## Phase 7 log

- Notifications on devices (Settings → Notifications on your devices): turn on per browser or phone, send a test, see each device's last delivery, turn off. iPhone needs Life OS added to the Home Screen first (Apple's rule); the screen explains this. Per reminder, "Also notify my devices" (on by default).
- Reminder sender: `/api/cron/reminders`, protected by `CRON_SECRET`, with one delivery per reminder per channel, retries after 1, 2, 4, 8 and 16 minutes, devices that have gone away removed, and nothing sent more than a day late. Scheduling it in hosting (Supabase pg_cron) is documented in DEPLOYMENT.md.
- Calendar → Import & export:
  - Import an .ics file from Google, Apple or Outlook. It's read in the browser and previewed; what can't be represented (single-occurrence changes, cancelled events, repeat rules this app doesn't support) is listed, never guessed. Re-importing adds only new events. Imported events are copies you can edit.
  - Download every event as .ics.
  - A private subscribe link for Google/Apple/Outlook (one-way, read-only), shown once, replaceable and revocable, with "last read" shown.
- Apple Health (Integrations, and Health → Import from Apple Health): choose the export.zip (or export.xml) from the Health app; it's streamed and read on the device, then previewed with counts and a choice of what to add. Weight, body fat, resting heart rate, sleep (one night per wake-up day, asleep time preferred over time in bed) and workouts (with distance and energy in the notes). Readings recorded by a device are marked "Device"; values typed into the Health app are marked "Imported". Re-importing adds nothing twice.
- Integrations page: each connection's status, what it can see, and whether it has been seen working (last delivery, last read, last import). Google Calendar and email say plainly that they aren't connected.
- Migration `0014_integrations`; Phase 7 tables added to the export (device keys and the link hash left out).
- Tests:
  - Unit: .ics writing and reading (escaping, folding, all-day, time zones incl. Windows names, durations, unsupported rules, caps) and the Apple Health reader (units, sleep grouping, workouts, any chunk size).
  - `supabase/tests/integrations.sql`.
  - Playwright: notifications (encrypted delivery to a stand-in push service, retries, no duplicates, a device that has gone away), calendar files (import once, download, link create/replace/turn off, signed-out access only by token), Apple Health (zip and xml, preview, choose, honest sources, no duplicates).
- Not verified: delivery through real push services to a real phone, and the schedule in hosting. Both need the app deployed.
- Waiting for approval: Google Calendar two-way sync (Google Cloud project and OAuth consent) and email reminders (a sending service such as Resend).

## Phase 8 log

- Export (Settings → Your data): everything as one JSON file, every table as CSV in one .zip, or a single table as CSV. Read through the person's own session with an explicit owner filter; integration secrets and search indexes are left out; every export is audited. The zip is written by a small built-in writer (no new dependency).
- Account deletion: password again plus the typed phrase "delete my account". Migration `0013_account_deletion` adds `delete_my_account()`, which deletes only the caller; every table cascades from the auth user. The person lands on the sign-in page with a confirmation.
- Security: a per-request nonce Content-Security-Policy from `src/proxy.ts` (`strict-dynamic`, no inline scripts; the theme script carries the nonce), plus HSTS and Cross-Origin-Opener-Policy. Assistant provider errors are now logged (type and status only). Review notes in [SECURITY.md](SECURITY.md).
- Accessibility: an axe scan of all 19 screens plus sign-in and sign-up, in light and dark, now passes WCAG 2.1 AA. Fixed text contrast (the subtle grey, success, warning and destructive colours, chart tooltips), spoken names that didn't match visible text, and form errors and hints that weren't linked to their fields. Notes in [ACCESSIBILITY.md](ACCESSIBILITY.md).
- Monitoring: `/healthz` for an uptime monitor (200 when the database answers, 503 when not; reveals nothing else).
- [DEPLOYMENT.md](DEPLOYMENT.md): Supabase and Vercel setup, releasing, backups and a restore drill, monitoring, shutting down. Written and checked against the local stack only; **no accounts were created**.
- Tests:
  - 118 unit tests (adds CSV export, CRC-32 and a zip that `unzip` accepts).
  - `supabase/tests/account.sql`: anonymous callers are refused; deleting removes the caller's rows from every table, including trigger-guarded transfers and links, and leaves another person's data alone.
  - Playwright: an accessibility suite (scans plus keyboard: skip link, search, dialog focus), and an account flow (security headers, health check, JSON/zip/CSV exports containing only the person's rows, a wrong password refused, deletion, sign-in afterwards refused, the other person's data intact).
- Known limits: no screen-reader testing yet, no multi-factor sign-in, no import of an export, and Free-plan Supabase has no downloadable backups (use the export).

## Phase 6 log

- Model: Haiku 5.5 by default (approved by Ab), switchable to Sonnet 5.5 or Opus 5.5 in Settings → AI assistant. Calls go from the server only, through the official `@anthropic-ai/sdk`, with `ANTHROPIC_API_KEY` from the server environment. The browser never sees the key and the model never sees database credentials.
- Migration `0012_assistant`: per-person assistant settings (off by default, no areas shared, known models and modules only, monthly budget, retention), cache token counts on messages, `ai_usage` per call, `ai_briefings` (one per day, facts kept beside the text), and report write-ups that record which model wrote them and when.
- Sharing: each module is off until switched on. Health, finance and journal each have their own switch, and journal entries are readable only when shared one by one from Reflection (an entry can't be both private and shared). Relationship notes and admin reference numbers are never sent.
- The assistant (`/assistant`):
  - Read tools run as the signed-in person through RLS: tasks, events, habits, goals, projects, learning, people, admin, note search, reports, Wheel of Life, reflection, and (if shared) finance, health and journal. Results are capped and carry links to the records.
  - Changes are only suggested: add a task, complete a task, add an event or time block, log a habit. Each shows as a card with Confirm and Decline; confirming runs the normal validated action and marks the record `ai_suggested`. Suggestions expire after 7 days and can't be confirmed twice.
  - Answers separate Facts, Estimates and Suggestions; only in-app links are clickable.
  - Conversations are kept for the chosen period, can be deleted, and each turn records its tool calls.
- Briefing: "Write it" on the assistant page writes today's short briefing from the shared areas.
- Reports: "Write a reading" writes an interpretation of a saved snapshot, shown apart from the measured facts and labelled with the model and time. Re-saving the snapshot clears the old reading.
- Cost controls: a monthly budget (default $5, the app's own estimate from token counts), 60 calls per 10 minutes, low effort, and prompt caching of the fixed instructions. Ab should also set a spend limit in the Anthropic console.
- Fixed (found while testing): the Settings page overflowed sideways on phones; an older test raced a background save.
- Tests:
  - 113 unit tests. New ones cover the tool loop (results returned together, thinking replayed, proposals never applied, refused or invalid tool calls, refusals, step limit), which tools each sharing choice offers, cost estimates and the safe markdown.
  - `supabase/tests/assistant.sql`: defaults, model/module/budget checks, a suggestion can't be stored as done, one briefing a day, journal privacy, and another person seeing or deciding none of it.
  - A Playwright flow against a scripted stand-in for the API (no key, no cost): off by default, sharing two areas, a suggestion that changes nothing until confirmed, linked answers, finance not offered, declining, briefing, report reading, what was sent, and the budget stopping it.
- **Not yet verified live:** no real API call has been made. That happens once an API key is added.
- Known limits: answers arrive whole rather than streamed; no voice; the budget is an estimate, not Anthropic's billing.

## Phase 5 log

- Migration `0011_health_reports`: a metric/imperial preference on the profile; each body metric accepts only its own units (weight kg/lb, lengths cm/in, heart rate bpm, blood pressure mmHg) and a plausible range, so a slip like 820 kg is refused instead of charted; one reading per metric per moment; set numbers unique per exercise in a workout; saved reports must store their facts as an object and cover at most a year.
- Health & Fitness (`/health`) has four tabs:
  - Today: check-ins (mood, energy, stress on 1–5, at least one), water with quick-add buttons, and the last seven days at a glance with last night's sleep.
  - Workouts: activity, date, start, minutes, effort (1–10), an optional goal, and sets (exercise, reps, weight, distance); this week's totals and an 8-week minutes chart.
  - Body: weight, waist, hip, chest, body fat and resting heart rate, each with a chart and all readings; blood pressure is saved as a pair and listed without categories.
  - Mood & energy: 7/30/90-day lines with gaps for days not logged, and daily water.
- Sleep & Recovery (`/sleep`): log a night by bed and wake time (bedtimes after midnight are handled), how rested you feel and times woken; averages, typical bed/wake time and spread, and a chart with a 7-hour guideline line. One manual night per date.
- Values are stored as typed and converted only for display, using the Units setting in Settings.
- Reports (`/reports`): day, week, month, quarter or year, stepping back through earlier periods. Tasks (on time, late, undated), daily-habit consistency, focus time by project, workouts, sleep, check-in averages, water, money per currency (never added across currencies), days journaled (by date only; text is never read), people contacted, milestones, goals reached and learning finished. A period still running is compared with the same number of days of the previous one, and a coverage line says how many days have anything logged. Save a snapshot to keep the numbers as they were; the interpretation area stays empty until the assistant (phase 6) and is labelled apart from the facts. Print gives a clean page.
- ⌘K has "Mood & energy check-in", "Log a workout" and "Log sleep". Sample data adds weeks of check-ins and sleep, workouts with sets, weekly weights, heart rate and waist readings, and water, all marked Sample.
- Fixed (found while testing): a blank optional number in some forms was saved as 0 instead of empty.
- Tests:
  - 101 unit tests. New ones cover unit conversion and ranges, sleep across midnight and its averages, workouts and volume, measurement series, report periods and labels, report counts (late vs on-time tasks, habits created or paused mid-period, money per currency, pending transactions left out) and honest empty reports.
  - `supabase/tests/health.sql`: units and ranges, duplicate readings, sleep and set rules, check-ins without a rating, report shape and length, and another person seeing or changing none of it.
  - A Playwright flow: a check-in (and the error without a rating), water, a workout with sets, a refused 820 kg, a saved weight, a night across midnight, the duplicate-night message, and a daily report with a saved snapshot.
- Known limits:
  - Everything is entered by hand; device and app imports arrive with integrations (phase 7).
  - Nothing is rated as healthy or unhealthy, and there is no medical advice; the 7-hour line is a general guideline only.
  - Reports count weekly and monthly habits only through their check-ins; the consistency rate uses daily habits.

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
