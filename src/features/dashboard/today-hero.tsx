"use client";

import Link from "next/link";
import { ArrowRight, CalendarCheck2, Sparkles } from "lucide-react";
import { ProvenanceBadge } from "@/components/data/provenance";
import { formatShortDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { findConflicts, type DashboardModel, type EventView } from "./compute";
import { TaskRow } from "./widgets/task-row";

function startsIn(e: EventView, now: Date): string {
  const mins = Math.round((new Date(e.starts_at).getTime() - now.getTime()) / 60_000);
  if (mins <= 0) return "Happening now";
  if (mins < 60) return `Next up · in ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `Next up · in ${h}h${m ? ` ${m}m` : ""}`;
}

/** Progress ring for the day: tasks done today against what is still on today's list. */
function DayRing({ done, total }: { done: number; total: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = total ? done / total : 0;
  return (
    <div className="relative size-[124px] shrink-0">
      <svg viewBox="0 0 124 124" className="size-full -rotate-90" role="img" aria-label={`${done} of ${total} tasks done today`}>
        <circle cx="62" cy="62" r={r} fill="none" strokeWidth="10" className="stroke-muted" />
        {pct > 0 && (
          <circle
            cx="62" cy="62" r={r} fill="none" strokeWidth="10" strokeLinecap="round"
            className="stroke-brand transition-[stroke-dasharray] duration-700 ease-out"
            strokeDasharray={`${pct * c} ${c}`}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden>
        <span className="tabular font-display text-[30px] leading-none font-normal tracking-[-0.01em]">{done}/{total}</span>
        <span className="mt-1 text-xs text-muted-foreground">done today</span>
      </div>
    </div>
  );
}

function Stat({ label, value, href, tone }: { label: string; value: React.ReactNode; href?: string; tone?: "attention" }) {
  const body = (
    <>
      <span className={cn("text-xs text-muted-foreground", tone && "text-[color-mix(in_oklch,var(--warning)_75%,var(--foreground))]")}>{label}</span>
      <span className="tabular font-display text-xl font-normal tracking-[-0.01em]">{value}</span>
    </>
  );
  const cls = cn("flex flex-col gap-0.5 rounded-2xl bg-surface-2 px-4 py-3", tone && "bg-warning/12", href && "transition-colors hover:bg-muted");
  return href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

export function TodayHero({ m, now }: { m: DashboardModel; now: Date }) {
  const focus = m.briefing.suggestedPriorities;
  const total = m.stats.doneToday + m.priorities.length;
  const timed = m.agenda.filter((e) => !e.all_day && new Date(e.ends_at) > now);
  const next = timed[0];
  const later = timed.slice(1, 3);
  const conflictIds = new Set(findConflicts(m.agenda).flat().map((e) => e.id));
  const tomorrow = m.upcoming[0];

  return (
    <div className="mb-5 grid grid-cols-1 gap-5 xl:grid-cols-12">
      <section aria-label="Today's priorities" className="animate-rise rounded-3xl bg-card p-5 shadow-card sm:p-7 xl:col-span-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8">
          <div className="hidden sm:block"><DayRing done={m.stats.doneToday} total={total} /></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-lg font-normal tracking-[-0.01em]">Your top three</h2>
              {focus[0] && <ProvenanceBadge source={focus[0].source} />}
              <span className="tabular ml-auto text-[13px] text-muted-foreground sm:hidden">{m.stats.doneToday} of {total} done</span>
            </div>
            {focus.length ? (
              <ul className="mt-1 divide-y divide-border">
                {focus.map((t) => <TaskRow key={t.id} task={t} />)}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Nothing urgent today. A good day to move a goal forward.</p>
            )}
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <Stat label="Events today" value={m.agenda.length} />
          <Stat label="Habits" value={m.stats.habitsScheduledToday ? `${m.stats.habitsDoneToday} of ${m.stats.habitsScheduledToday}` : "None today"} href="/habits" />
          <Stat label="Open tasks" value={m.stats.openTasks} href="/tasks" />
          {m.overdue.length > 0
            ? <Stat label="Needs a decision" value={`${m.overdue.length} overdue`} href="/tasks" tone="attention" />
            : <Stat label="Overdue" value="None" />}
        </div>
      </section>

      <section
        aria-label="Next up"
        className="animate-rise flex flex-col gap-5 rounded-3xl bg-inverse p-6 text-inverse-foreground shadow-raised [animation-delay:60ms] sm:p-7 xl:col-span-4"
      >
        {next ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold tracking-[0.1em] text-inverse-accent uppercase">{startsIn(next, now)}</span>
              {conflictIds.has(next.id) && <span className="text-xs font-medium text-inverse-accent">Overlaps</span>}
            </div>
            <div>
              <h2 className="font-display text-2xl leading-tight font-normal tracking-[-0.01em]">{next.title}</h2>
              <p className="tabular mt-1.5 text-sm text-inverse-muted">
                {next.timeLabel}
                {next.location && ` · ${next.location}`}
              </p>
            </div>
            {later.length > 0 && (
              <ul className="border-t border-white/10">
                {later.map((e) => (
                  <li key={e.id} className="flex gap-4 border-b border-white/8 py-3 text-sm">
                    <span className="tabular w-[4.5rem] shrink-0 text-inverse-muted">{e.timeLabel.split(" – ")[0]}</span>
                    <span className="min-w-0">
                      <span className="block truncate">{e.title}</span>
                      {conflictIds.has(e.id) && <span className="text-xs text-inverse-accent">Overlaps another event</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <CalendarCheck2 className="size-7 text-inverse-accent" strokeWidth={1.6} aria-hidden />
            <div>
              <h2 className="font-display text-2xl leading-tight font-normal tracking-[-0.01em]">The rest of today is clear</h2>
              <p className="mt-1.5 text-sm text-inverse-muted">
                {tomorrow ? <>Next: {tomorrow.title}, {formatShortDate(tomorrow.dateKey)}{!tomorrow.all_day && ` at ${tomorrow.timeLabel.split(" – ")[0]}`}.</> : "Nothing on your calendar this week."}
              </p>
            </div>
          </>
        )}
        <Link href="/calendar" className="mt-auto inline-flex h-10 items-center gap-1.5 self-start rounded-xl bg-white/10 px-4 text-sm font-medium transition-colors hover:bg-white/16">
          Open calendar <ArrowRight className="size-4" aria-hidden />
        </Link>
      </section>

      {m.suggestions[0] && (
        <section aria-label="Worth a look" className="animate-rise flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[20px] bg-accent px-5 py-4 [animation-delay:120ms] xl:col-span-12">
          <Sparkles className="size-5 shrink-0 text-brand" strokeWidth={1.8} aria-hidden />
          <p className="min-w-0 flex-1 basis-72 text-sm text-foreground">
            <strong className="font-semibold">Worth a look.</strong> {m.suggestions[0].text}
          </p>
          <Link href={m.suggestions[0].href} className="inline-flex h-9 items-center rounded-[10px] bg-surface px-3.5 text-sm font-medium text-accent-foreground shadow-card">
            Review
          </Link>
        </section>
      )}
    </div>
  );
}
