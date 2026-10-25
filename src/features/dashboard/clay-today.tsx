"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, Check, ListChecks, Repeat, Sparkles, Target } from "lucide-react";
import { TINT_BG, type Tint } from "@/components/clay/tile";
import { formatShortDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { saveTodayMood, setHabitDoneToday, setTaskDone } from "@/server/actions/dashboard";
import { findConflicts, type DashboardModel, type EventView, type HabitView, type TaskView } from "./compute";
import { useServerAction } from "./use-server-action";

export type SkyPhase = "dawn" | "day" | "evening" | "night";

export type HeroText = {
  /** "Good evening" */
  greeting: string;
  /** First name, shown in clay italic on its own line. */
  name: string | null;
  /** "SAT, 24 OCT · 20:45" */
  shortLabel: string;
  /** "SATURDAY · 24 OCTOBER 2026 · 20:45" */
  longLabel: string;
  sky: SkyPhase;
  summary: string;
};

/* ------------------------------------------------------------------------ */
/* Hero: a soft landscape whose sky follows the time of day                  */
/* ------------------------------------------------------------------------ */

const SUN_POSITION: Record<SkyPhase, string> = {
  dawn: "bottom-[22%]",
  day: "bottom-[40%]",
  evening: "bottom-[24%]",
  night: "bottom-[34%] scale-75",
};

function Landscape({ sky }: { sky: SkyPhase }) {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <div className={cn("absolute right-[13%] size-16 rounded-full lg:right-[7%] bg-[var(--hero-sun)] lg:size-[88px]", SUN_POSITION[sky], sky === "night" && "opacity-80")} />
      <svg viewBox="0 0 400 200" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-[52%] w-full">
        <path d="M0 88 C 70 30, 190 18, 300 52 C 350 66, 385 80, 400 86 L400 200 L0 200 Z" fill="var(--hero-hill-back)" />
        <path d="M120 200 C 175 112, 270 70, 400 72 L400 200 Z" fill="var(--hero-hill-front)" />
      </svg>
    </div>
  );
}

const MOODS = [
  { value: 1, label: "Heavy", color: "#9aa6b8", size: "size-2" },
  { value: 2, label: "Low", color: "#b8b29a", size: "size-2.5" },
  { value: 3, label: "Steady", color: "#7d8f6e", size: "size-3" },
  { value: 4, label: "Good", color: "#d6a15f", size: "size-3.5" },
  { value: 5, label: "Bright", color: "#c2734f", size: "size-4" },
];

function MoodCheck({ value, onPick, pending, className }: { value: number | null; onPick: (v: number) => void; pending: boolean; className?: string }) {
  const labelId = useId();
  return (
    <div className={cn("flex items-center justify-between gap-1 rounded-[22px] bg-card py-1.5 pr-1.5 pl-4 shadow-clay sm:pl-5", className)}>
      <span id={labelId} className="font-display text-[15px] whitespace-nowrap sm:text-[16px]">How was today?</span>
      <div role="radiogroup" aria-labelledby={labelId} className="flex items-center">
        {MOODS.map((m) => {
          const on = value === m.value;
          return (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={m.label}
              disabled={pending}
              onClick={() => onPick(m.value)}
              className="flex h-11 w-10 items-center justify-center rounded-full sm:w-11"
            >
              <span className={cn("flex size-8 items-center justify-center rounded-full border border-border bg-background transition-shadow", on && "border-transparent ring-2 ring-foreground")}>
                <span className={cn("rounded-full", m.size)} style={{ background: m.color }} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Hero({ text, mood }: { text: HeroText; mood: React.ReactNode }) {
  return (
    <section aria-label="Greeting" className="clay-sky relative h-[196px] overflow-hidden rounded-[28px] shadow-clay lg:h-[220px]" data-sky={text.sky}>
      <Landscape sky={text.sky} />
      <div className="relative px-6 pt-6 lg:px-9 lg:pt-8">
        <p className="label-caps !text-muted-foreground">
          <span className="lg:hidden">{text.shortLabel}</span>
          <span className="max-lg:hidden">{text.longLabel}</span>
        </p>
        <h1 className="mt-2.5 font-display text-[34px] leading-[1.08] font-light lg:text-[44px]">
          {text.name ? <>{text.greeting},<br className="lg:hidden" /> <span className="accent-italic">{text.name}.</span></> : `${text.greeting}.`}
        </h1>
        <p className="mt-1 hidden max-w-[62%] font-display text-[16px] text-muted-foreground italic lg:block">{text.summary}</p>
      </div>
      <div className="absolute bottom-6 left-9 max-lg:hidden">{mood}</div>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* Stat tiles                                                                */
/* ------------------------------------------------------------------------ */

function StatTile({ href, icon: Icon, tint, value, label, pill }: {
  href: string; icon: typeof ListChecks; tint: Tint; value: React.ReactNode; label: string; pill?: string;
}) {
  return (
    <Link href={href} className={cn("relative flex min-h-[172px] min-w-0 flex-col rounded-[24px] p-5 shadow-clay transition-transform active:scale-[0.98] lg:min-h-[180px]", TINT_BG[tint])}>
      <span className="flex size-[38px] items-center justify-center rounded-[13px] bg-card">
        <Icon className="size-[18px]" strokeWidth={1.6} aria-hidden />
      </span>
      {pill && <span className="absolute top-5 right-4 rounded-full bg-card px-2.5 py-0.5 text-[12px] text-muted-foreground">{pill}</span>}
      <span className="tabular mt-auto font-display text-[38px] leading-none font-normal">{value}</span>
      <span className="mt-2 truncate text-[12px] text-muted-foreground">{label}</span>
    </Link>
  );
}

function StatTiles({ m, now }: { m: DashboardModel; now: Date }) {
  const { habitsDoneToday: hd, habitsScheduledToday: hs, openTasks } = m.stats;
  const timed = m.agenda.filter((e) => !e.all_day);
  const left = timed.filter((e) => new Date(e.ends_at) > now).length;
  const events = m.agenda.length;
  const eventLabel = !events ? "Events today" : `${events === 1 ? "Event" : "Events"} · ${left ? `${left} to go` : timed.length ? "all done" : "all day"}`;
  const goal = m.goals.find((g) => g.pct !== null);
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-3.5 md:grid-cols-4">
      <StatTile href="/tasks" icon={ListChecks} tint="clay" value={openTasks} label="Open tasks" pill={`${m.overdue.length} late`} />
      <StatTile href="/habits" icon={Repeat} tint="sage" value={hs ? `${hd}/${hs}` : "0"} label={hs ? "Habits today" : "No habits today"} />
      <StatTile href="/calendar" icon={CalendarDays} tint="sand" value={events} label={eventLabel} />
      <StatTile href="/goals" icon={Target} tint="mist" value={goal ? `${goal.pct}%` : m.goals.length} label={goal ? goal.title : "Active goals"} />
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Cards                                                                      */
/* ------------------------------------------------------------------------ */

function Card({ title, accent, meta, href, children, className, label }: {
  title?: string; accent?: string; meta?: React.ReactNode; href?: string; children: React.ReactNode; className?: string; label: string;
}) {
  return (
    <section aria-label={label} className={cn("min-w-0 rounded-[28px] bg-card p-6 shadow-clay", className)}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[24px] leading-tight font-normal">
          {href ? <Link href={href} className="hover:underline">{title} {accent && <span className="accent-italic-sage">{accent}</span>}</Link> : <>{title} {accent && <span className="accent-italic-sage">{accent}</span>}</>}
        </h2>
        {meta && <span className="shrink-0 text-[13px] text-muted-foreground">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

function TaskLine({ task }: { task: TaskView }) {
  const [done, setDone] = useState(task.status === "done");
  const { pending, run } = useServerAction();
  const toggle = () => {
    const next = !done;
    setDone(next);
    run(() => setTaskDone(task.id, next), { onError: () => setDone(!next), quiet: true });
  };
  const meta = [task.dueLabel && (task.late ? task.dueLabel : `Due ${task.dueLabel}`), task.area].filter(Boolean).join(" · ");
  return (
    <li className="flex items-start gap-3.5 border-b border-border py-3.5 last:border-b-0">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={`Mark “${task.title}” ${done ? "not done" : "done"}`}
        onClick={toggle}
        disabled={pending}
        className={cn(
          "relative mt-0.5 flex size-[26px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-foreground transition-colors before:absolute before:-inset-2.5 before:content-['']",
          done && "animate-pop bg-foreground text-background",
        )}
      >
        {done && <Check className="size-3.5" strokeWidth={2.4} aria-hidden />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn("font-display text-[18px] leading-snug", done && "text-muted-foreground line-through")}>{task.title}</p>
        {meta && <p className={cn("mt-0.5 truncate text-[13px] text-muted-foreground first-letter:uppercase", task.late && !done && "text-destructive")}>{meta}</p>}
      </div>
      {task.priority <= 2 && !done && (
        <span className="mt-1 shrink-0 rounded-md bg-tint-clay px-2 py-0.5 text-[11px] font-medium tracking-[0.12em] text-accent-foreground uppercase">
          {task.priority === 1 ? "Urgent" : "High"}
        </span>
      )}
    </li>
  );
}

function TasksCard({ m }: { m: DashboardModel }) {
  const list = m.priorities.slice(0, 5);
  return (
    <Card label="Today's tasks" title="Today's" accent="tasks" href="/tasks" meta={`${m.stats.openTasks} open`}>
      {list.length ? (
        <ul>{list.map((t) => <TaskLine key={t.id} task={t} />)}</ul>
      ) : (
        <p className="py-2 font-display text-[16px] text-muted-foreground italic">Nothing due today. A good day to move a goal forward.</p>
      )}
    </Card>
  );
}

function HabitLine({ h }: { h: HabitView }) {
  const [done, setDone] = useState(h.doneToday);
  const { pending, run } = useServerAction();
  const toggle = () => {
    const next = !done;
    setDone(next);
    run(() => setHabitDoneToday(h.id, next), { onError: () => setDone(!next), quiet: true });
  };
  const days = h.last7.map((d, i) => (i === h.last7.length - 1 ? { ...d, state: done ? "done" : h.scheduledToday ? "future" : "off" } : d));
  const note = done ? "done" : h.streak > 1 ? `${h.streak} days` : h.scheduledToday ? "today" : "rest day";
  return (
    <li className="border-b border-border py-3.5 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate font-display text-[18px]">{h.name}</p>
        <span className={cn("inline-flex shrink-0 items-center gap-1 font-display text-[15px] italic", done ? "text-brand" : "text-muted-foreground")}>
          {note}{done && <Check className="size-3.5" strokeWidth={2} aria-hidden />}
        </span>
      </div>
      <div className="mt-2.5 flex items-center gap-2" aria-label={`${h.name}, last 7 days`}>
        {days.map((d, i) => {
          const isToday = i === days.length - 1;
          const dot = cn(
            "size-[22px] rounded-full border",
            d.state === "done" ? "border-transparent bg-sage" : "border-border bg-background",
            d.state === "future" && "border-dashed border-foreground/50",
            d.state === "before" && "opacity-40",
          );
          const title = `${formatShortDate(d.date)}: ${d.state === "done" ? "done" : d.state === "missed" ? "missed" : d.state === "off" ? "not scheduled" : d.state === "future" ? "not done yet" : "before the habit started"}`;
          return isToday && h.scheduledToday ? (
            <button
              key={d.date}
              type="button"
              role="checkbox"
              aria-checked={done}
              aria-label={`${h.name}: mark ${done ? "not done" : "done"} today`}
              onClick={toggle}
              disabled={pending}
              className="relative before:absolute before:-inset-3 before:content-['']"
            >
              <span className={cn(dot, "block", done && "animate-pop")} />
            </button>
          ) : (
            <span key={d.date} title={title} className={dot} />
          );
        })}
      </div>
    </li>
  );
}

function HabitsCard({ m }: { m: DashboardModel }) {
  const { habitsDoneToday: d, habitsScheduledToday: s } = m.stats;
  return (
    <Card label="Habits" accent="Habits" href="/habits" meta={s ? `${d} of ${s} today` : undefined}>
      {m.habits.length ? (
        <ul>{m.habits.slice(0, 5).map((h) => <HabitLine key={h.id} h={h} />)}</ul>
      ) : (
        <p className="py-2 font-display text-[16px] text-muted-foreground italic">No habits yet. Start with one small routine.</p>
      )}
    </Card>
  );
}

const BAR: Record<EventView["kind"], string> = {
  event: "bg-sage",
  meeting: "bg-clay",
  appointment: "bg-gold",
  time_block: "bg-clay",
  reminder_only: "bg-stone",
};

function AgendaCard({ m, now, nowLabel, dayLabel }: { m: DashboardModel; now: Date; nowLabel: string; dayLabel: string }) {
  const conflictIds = new Set(findConflicts(m.agenda).flat().map((e) => e.id));
  const allDay = m.agenda.filter((e) => e.all_day);
  const timed = m.agenda.filter((e) => !e.all_day);
  const nowIndex = timed.findIndex((e) => new Date(e.starts_at) > now);
  const rows: (EventView | "now")[] = [...allDay, ...timed];
  if (timed.length) rows.splice(allDay.length + (nowIndex === -1 ? timed.length : nowIndex), 0, "now");
  return (
    <Card label="Agenda" accent="Agenda" href="/calendar" meta={dayLabel}>
      {m.agenda.length ? (
        <ul>
          {rows.map((e) =>
            e === "now" ? (
              <li key="now" className="flex items-center gap-3 py-2" aria-label={`Now, ${nowLabel}`}>
                <span className="text-[12px] font-medium tracking-[0.16em] text-brand uppercase">Now {nowLabel}</span>
                <span className="h-px flex-1 bg-clay" aria-hidden />
              </li>
            ) : (
              <li key={e.id} className="flex gap-4 border-b border-border py-3 last:border-b-0">
                <span className="tabular w-[62px] shrink-0 pt-1 text-[13px] whitespace-nowrap text-muted-foreground">{e.all_day ? "All day" : e.timeLabel.split(" – ")[0]}</span>
                <span className={cn("w-[3px] shrink-0 self-stretch rounded-full", BAR[e.kind])} aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate font-display text-[18px] leading-snug">{e.title}</span>
                  <span className="block truncate text-[13px] text-muted-foreground">
                    {[e.location, e.kind === "time_block" ? "Focus" : null, conflictIds.has(e.id) ? "Overlaps" : null].filter(Boolean).join(" · ") || e.timeLabel}
                  </span>
                </span>
              </li>
            ),
          )}
        </ul>
      ) : (
        <p className="py-2 font-display text-[16px] text-muted-foreground italic">
          Nothing on the calendar today.{m.upcoming[0] && <> Next: {m.upcoming[0].title}, {formatShortDate(m.upcoming[0].dateKey)}.</>}
        </p>
      )}
    </Card>
  );
}

function AssistantCard({ m, assistant }: { m: DashboardModel; assistant: boolean }) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const s = m.suggestions.find((x) => !dismissed.includes(x.id));
  if (!s && !assistant) return null;
  return (
    <section aria-label="Suggestion" className="rounded-[28px] bg-inverse p-6 text-inverse-foreground shadow-clay">
      <p className="flex items-center gap-2 text-[11px] font-medium tracking-[0.2em] text-inverse-muted uppercase">
        <Sparkles className="size-3.5 text-clay" strokeWidth={1.6} aria-hidden /> {s ? "Worth a look" : "Assistant"}
      </p>
      <p className="mt-3 font-display text-[21px] leading-snug">{s ? s.text : "Ask about your week, your habits or what to do next."}</p>
      <div className="mt-5 flex flex-wrap gap-2.5">
        {s ? (
          <>
            <Link href={s.href} className="inline-flex h-11 items-center rounded-full bg-clay px-5 text-[14px] font-medium text-[#fbf8f1]">Review</Link>
            <button type="button" onClick={() => setDismissed((d) => [...d, s.id])} className="inline-flex h-11 items-center rounded-full border border-current/25 px-5 text-[14px]">Not now</button>
          </>
        ) : (
          <Link href="/assistant" className="inline-flex h-11 items-center gap-2 rounded-full bg-clay px-5 text-[14px] font-medium text-[#fbf8f1]">
            Ask your assistant <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
      </div>
    </section>
  );
}

function GoalsCard({ m }: { m: DashboardModel }) {
  const goals = m.goals.filter((g) => g.pct !== null).slice(0, 3);
  if (!m.goals.length) return null;
  return (
    <Card label="Goals" title="Goals" href="/goals" meta={`${m.goals.length} active`}>
      {goals.length ? (
        <ul className="space-y-5 pt-1">
          {goals.map((g, i) => (
            <li key={g.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate font-display text-[17px]">{g.title}</span>
                <span className="tabular font-display text-[16px]">{g.pct}%</span>
              </div>
              <div className="relative mt-2.5 h-px bg-border" role="progressbar" aria-valuenow={g.pct ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label={`${g.title} progress`}>
                <div className={cn("absolute inset-y-0 left-0 h-[2px] -translate-y-px", i % 2 ? "bg-sage" : "bg-clay")} style={{ width: `${g.pct}%` }} />
                <span className={cn("absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full", i % 2 ? "bg-sage" : "bg-clay")} style={{ left: `${g.pct}%` }} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="font-display text-[16px] text-muted-foreground italic">Add a metric to a goal to see its progress here.</p>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------------ */
/* Layout                                                                    */
/* ------------------------------------------------------------------------ */

/**
 * Today in Clay Zen. Phones: hero, mood card, 2×2 tiles, then cards stacked.
 * Desktop: 8 / 4 columns with the mood row inside the hero.
 */
export function ClayToday({ m, now, text, nowLabel, dayLabel, assistant }: {
  m: DashboardModel; now: Date; text: HeroText; nowLabel: string; dayLabel: string; assistant: boolean;
}) {
  const todayMood = m.wellness?.days.find((d) => d.date === m.todayKey)?.mood ?? null;
  const [mood, setMood] = useState<number | null>(todayMood);
  const { pending, run } = useServerAction();
  const pick = (v: number) => {
    const prev = mood;
    setMood(v);
    run(() => saveTodayMood(v), { onError: () => setMood(prev) });
  };

  return (
    <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12 lg:gap-5">
      <div className="flex min-w-0 flex-col gap-3.5 lg:col-span-8 lg:gap-5">
        <Hero text={text} mood={<MoodCheck value={mood} onPick={pick} pending={pending} />} />
        <MoodCheck value={mood} onPick={pick} pending={pending} className="lg:hidden" />
        <StatTiles m={m} now={now} />
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:gap-5">
          <TasksCard m={m} />
          <HabitsCard m={m} />
        </div>
      </div>
      <div className="grid min-w-0 grid-cols-1 content-start gap-3.5 md:grid-cols-2 lg:col-span-4 lg:grid-cols-1 lg:gap-5">
        <AgendaCard m={m} now={now} nowLabel={nowLabel} dayLabel={dayLabel} />
        <AssistantCard m={m} assistant={assistant} />
        <GoalsCard m={m} />
      </div>
    </div>
  );
}
