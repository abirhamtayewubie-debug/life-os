-- Habit times and reminders (additive; no existing row changes).
--
-- A habit can have a planned local time. Its reminder is an ordinary
-- `reminders` row tied to the habit with a repeat rule, so the existing
-- sender (pg_cron -> /api/cron/reminders -> web push) and the in-app
-- notifier deliver it. The sender moves it to the next occurrence itself and
-- stays quiet when the day's (or week's) target is already met.

alter table public.habits add column scheduled_time time;

alter table public.reminders add column habit_id uuid;
alter table public.reminders
  add constraint reminders_habit_fk foreign key (habit_id, user_id) references public.habits (id, user_id) on delete cascade;
-- A habit reminder always repeats.
alter table public.reminders
  add constraint reminders_habit_repeats check (habit_id is null or recurrence_rule is not null);
create index reminders_habit_idx on public.reminders (habit_id);
-- At most one live reminder per habit.
create unique index reminders_one_live_per_habit on public.reminders (user_id, habit_id)
  where habit_id is not null and status in ('scheduled', 'snoozed');
