# Life OS — implementation plan for the in-place upgrade

Started 2026-10-24. This file tracks the "modify, extend, improve" upgrade of the
existing app across sessions. The current code and schema are the source of
truth; nothing here replaces a working module.

Ground rules (from Ab's brief):

- Modify in place. No new app, no parallel modules, no second task system.
- No destructive database changes; migrations are additive and version-controlled.
- Migrations reach production only after Ab approves (Ab runs them in the Supabase SQL editor).
- Finance stays as it is.
- One reviewable PR per increment; Ab merges.

## 1. What already exists (inspection, 2026-10-24)

Stack: Next.js 16 App Router, Server Actions + zod, Supabase Postgres with
forced owner RLS on every table (`private.apply_owner_policies`), composite
`(id, user_id)` foreign keys, `source` provenance on every row, pg_cron →
`/api/cron/reminders` → web push. 14 migrations (0001–0014) on `main`;
PR #14 (Google Calendar sync, migration 0015) is open and touches
`src/lib/calendar.ts`, `src/server/actions/calendar.ts`, `src/server/integrations.ts`,
the cron route and the Integrations page, so this work avoids those files until it merges.

| Section | Already works | Gaps against the brief |
|---|---|---|
| Today (`/`, `features/dashboard`) | Hero (top three, ring, next up), agenda, overdue & due soon, habits, goals, projects with deadline risk, money, wellness, sleep, insights, evening review, widget layout | No milestones, no blocked work, project deadlines not in the hero/next up |
| AI Assistant (`/assistant`, `server/ai`) | Permissioned read tools per module (tasks, events, habits, goals, projects, learning, health, finance, reports, journal opt-in), confirm-first proposals | Not verified live (no Anthropic key yet). No project-task / milestone detail tool |
| Calendar (`/calendar`) | Day/week/month/agenda, recurring events (RRULE + tz), time blocks for tasks, conflict detection, reminders on events, .ics import/export/feed | Quick add is a full dialog; project deadlines and milestones not shown; events can't be linked to a project from the form (column `calendar_events.project_id` exists) |
| Tasks & Reminders (`/tasks`) | Views, filters, saved views, priorities, tags, subtasks, dependencies, recurring tasks, reminders with snooze and device push | Status "waiting" is the only blocked concept |
| Goals & Vision | Hierarchy, milestones, progress metrics | — |
| Habits & Routines (`/habits`) | Daily/weekly cadence, weekdays, target per period, time of day (morning/afternoon/evening), history, streak + consistency (`habits/stats.ts`) | No exact scheduled time, no reminders, no weekly completion-rate chart |
| Finance | Full module (accounts, transactions, budgets, bills, multi-currency, CSV) | Keep intact |
| Health & Fitness (`/health`) | Today, workouts with sets/reps/weight, body measurements, mood & energy, Apple Health import, volume by exercise | No programs/templates, no personal records, limited progress charts; Sleep is a separate route |
| Sleep & Recovery (`/sleep`) | Sleep logs, consistency, trends (reads `getHealthWorkspace`) | Should live under Health |
| Work & Projects (`/work`) | Projects (status, area, dates, budget vs Finance spend), milestones, per-project Kanban with dnd-kit (To do / In progress / Waiting / Done), timeline, time tracking | No Blocked column name, no all-projects board, no list or calendar view, cards don't show subtasks/dependencies, card opens the Tasks page instead of a detail, no status breakdown in project detail |
| Learning (`/learning`) | Items (book/course/article/video/podcast/practice) with status and %, skills with level/target, notes | No roadmaps, study plans, scheduled sessions, reminders, exercises |
| Reflection (`/reflection`) | Journal kinds (journal, gratitude, reflection, prayer, meditation, intention), private by default, AI opt-in per entry, writing streak, values | No meditation library with YouTube links, no reading/books/uploads, no reading sessions, reviews live on Today (daily_reviews) |
| Reports (`/reports`) | Day/week/month/quarter/year, counts only, previous-period comparison, tasks, habits, focus time, workouts, sleep, money per currency, journal days, goals, milestones, learning | Projects completed, meditation, reading not covered; "no data" vs "missed" needs checking per section |
| Wheel of Life (`/wheel`) | Assessments + ratings, dashboard widget, goals and habits can link a category | To be removed from navigation only; records kept |
| Knowledge Base | Notes, kinds, search, wikilinks/backlinks | — |
| Settings / Integrations | Preferences, module toggles, notifications, AI settings, export, account deletion, sample data | — |
| Storage | No Supabase Storage buckets yet | Needed for reading uploads (private bucket, per-user paths) |

## 2. Modification table

| Section | Current implementation | Requested modification | Files / DB objects affected | Required changes | Data preservation | Tests |
|---|---|---|---|---|---|---|
| Work & Projects | `features/work/*`, `server/work.ts`, `tasks`, `task_dependencies`, `milestones`, `projects` | Main PM hub: To do/Doing/Blocked/Done, drag-and-drop, task cards, priorities, deadlines, subtasks, milestones, dependencies, progress, Board/List/Calendar/Timeline | `work-screen.tsx`, `project-board.tsx`, `types.ts`, `stats.ts`, `server/work.ts`, page | Reuse task rows (no new task table). "Blocked" = existing `waiting` status. Board across all projects, rich cards, in-place task detail (reuses Tasks' `TaskDetail`), List and Calendar views, status breakdown | No schema change; same rows shown in Tasks | unit: stats; e2e: board/list |
| Tasks | `features/tasks/*` | Integrate with projects | `task-form.tsx`, `task-list.tsx`, `task-detail.tsx` | Label `waiting` as "Blocked"; link from a task to its project board | Labels only | unit/e2e existing |
| Calendar | `features/calendar/*`, `server/calendar.ts` | Quick create, recurring, reminders, link to tasks and projects | `server/calendar.ts`, `calendar-screen.tsx`, `types.ts`; later `event-form.tsx` + `actions/calendar.ts` (after PR #14) | Show project deadlines and milestones; later: project picker on events, quick-add line | Read-only additions first | unit: calendar |
| Today | `features/dashboard/*`, `server/dashboard.ts` | Surface priorities, upcoming events, project deadlines | `compute.ts`, `types.ts`, `server/dashboard.ts`, `widgets/progress.tsx`, `sample-data.ts` | Milestones due soon and blocked counts in Projects widget; project deadline insight | Read-only | unit: dashboard |
| Habits | `habits`, `habit_logs`, `reminders` | Scheduled times, recurring schedules, reminders, completion history, streaks, weekly rate | migration: `habits.reminder_time`, `reminders.habit_id`; `habit-form.tsx`, `actions/habits.ts`, `habits-screen.tsx` | Reminder = recurring `reminders` row tied to the habit, so pg_cron + push deliver it | Additive columns | SQL: RLS; unit: weekly rate |
| Health + Sleep | `/health`, `/sleep`, `workouts`, `workout_sets`, `sleep_logs` | Sleep under Health; programs, exercise logs, PRs, progress charts | `health-screen.tsx` (new Sleep tab), `/sleep` → redirect to `/health?tab=sleep`, `modules.ts`; migration: `workout_programs`, `program_exercises` | Reuse SleepScreen inside Health; PRs computed from `workout_sets` | Sleep rows untouched; old `/sleep` links redirect | e2e: redirect; unit: PRs |
| Learning | `learning_items`, `skills` | Roadmaps, courses, skills, study plans, sessions, reminders, exercises, progress | migration: `learning_roadmaps`, `learning_steps`, `study_sessions`; `learning-screen.tsx` | Sessions are calendar events/reminders where possible | Existing items become roadmap steps only if linked | SQL RLS; unit |
| Reflection | `journal_entries` (+ meditation kind), `personal_values` | Meditation with YouTube links, journaling history, reading with uploads, reading sessions, daily/weekly/monthly reviews | migration: `meditation_sessions`/`media_links`, `reading_items`, `reading_sessions`, private storage bucket `reading` with per-user path policies | Reuse journal for writing; reviews reuse `daily_reviews` (add `monthly` kind) | Additive; private by default | SQL RLS incl. storage policies |
| Navigation | `lib/modules.ts`, `nav-items.tsx` | Remove Wheel of Life from nav; Sleep under Health | `modules.ts`, command palette, dashboard widget default | Hide from nav; keep `/wheel` route and data reachable from Settings → data | No deletion | e2e: nav |
| Reports | `features/reports/compute.ts`, `server/reports.ts` | Weekly/monthly/yearly across sections | compute + screen | Add projects completed, milestones, meditation, reading, learning sessions; "not tracked" vs "zero" | Read-only | unit: reports |
| AI Assistant | `server/ai/tools.ts` | Surface priorities, deadlines, summaries | tools registry | Add project detail/deadlines tool | Read-only, permission-scoped | unit: assistant |
| Finance | `features/finance/*` | Keep intact | — | None planned | — | existing |

## 3. Increments and status

| # | Increment | Branch / PR | Migration | Status |
|---|---|---|---|---|
| 1 | Plan + Work & Projects hub (Blocked column, all-projects board, rich cards, in-place detail, List and Calendar views) + Tasks labels + Calendar deadlines + Today milestones | `claude/project-thread-2x6q4b` | none | merged (#15) |
| 2 | Navigation: Work & Projects into Plan, Sleep inside Health (redirect), Wheel out of nav | `claude/project-thread-2x6q4b-nav` | none | merged (#16) |
| 3 | Habits: scheduled time, reminders via push, weekly rates | `claude/project-thread-2x6q4b-habits` | additive (`20261024000100_habit_reminders.sql`, run in production) | merged (#17) |
| 4a | Calendar: one-line quick add (date, time, range, duration, repeat, location, reminder) with preview and "More" into the full form | `claude/project-thread-2x6q4b` | none | merged (#18) |
| 4b | Calendar: project link on events (after Google PR #14 merges) | — | none expected | planned |
| 5 | Health: programs (days, targets, start a day pre-filled), Progress & PRs tab (records, estimated max, charts, exercise log), record badges on workouts | `claude/project-thread-2x6q4b` | additive (`20261024000200_workout_programs.sql`) | merged (#20) |
| fix | Habit reminders reach devices (in-app check no longer advances device reminders) | `claude/project-thread-2x6q4b` | none | merged (#19) |
| 6 | Learning: roadmaps with ordered steps and exercises linked to books/courses, weekly study plan, study reminders (repeating, quiet once study is logged that day), study log with weekly chart and streak; tabs Library & skills / Roadmaps / Study log | `claude/project-thread-2x6q4b` | additive (`20261024000300_learning_plans.sql`) | merged (#21). Calendar display of study blocks follows the Google Calendar PR |
| 7a | Reflection: tabs Journal (unchanged) / Meditation / Reviews. Meditation library of links (YouTube plays in-app via youtube-nocookie; CSP allows that player and i.ytimg.com thumbnails), favourites, archive, practice log with week total, streak and weekly chart. Weekly and monthly reviews in `daily_reviews` (new `monthly` kind, dated on the period's first day, same week start as Reports), with past reviews including evening ones | `claude/project-thread-2x6q4b` | additive (`20261024000400_meditation_reviews.sql`) | merged (#22) |
| 7b | Reflection: Reading tab. Books are Learning's `learning_items` (no second list) with pages and one uploaded file each; reading time is `study_sessions` with a page range (no second log), which moves the book to the page reached, starts it and finishes it on the last page. Files live in a private Storage bucket `reading` (50 MB, PDF/EPUB/text/images) under `<user>/<item>/`, with owner-only policies; uploads use one-time signed upload links, files open through `/learning/files/[id]` (5-minute signed link). Learning shows pages, files and page ranges too | `claude/project-thread-2x6q4b` | additive + storage (`20261024000500_reading_files.sql`) | PR open, SQL to run before merge |
| 8 | Reports + Assistant + Today summaries | — | none expected | planned |

## 4. Verification notes

- `npm run check` (typecheck, lint, unit tests) runs in this container.
- Local Supabase (`supabase start`) has failed here before (image pull limits), so SQL/RLS tests and e2e may need a fallback (local Postgres 16 harness) and Ab's check on the live site.
- Recovery: Supabase free plan has daily backups; before Ab runs any migration, export from Settings → Export data as an extra copy.
