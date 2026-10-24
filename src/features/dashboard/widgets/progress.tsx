"use client";

import { useState } from "react";
import Link from "next/link";
import { BarChart3, Check, FolderKanban, Repeat, Target } from "lucide-react";
import { EmptyState } from "@/components/data/empty-state";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatShortDate, relativeDay } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { setHabitDoneToday } from "@/server/actions/dashboard";
import { useServerAction } from "../use-server-action";
import type { DashboardModel, HabitView } from "../compute";
import { WidgetCard } from "./widget-card";

function HabitRow({ h }: { h: HabitView }) {
  const [done, setDone] = useState(h.doneToday);
  const { pending, run } = useServerAction();
  const toggle = () => {
    const next = !done;
    setDone(next);
    run(() => setHabitDoneToday(h.id, next), { onError: () => setDone(!next), quiet: true });
  };
  const days = h.last7.map((d) => (d.date === h.last7[6].date ? { ...d, state: done ? "done" : h.scheduledToday ? "future" : "off" } : d));
  return (
    <li className="flex items-center gap-3 py-2">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={`${h.name}: mark ${done ? "not done" : "done"} today`}
        disabled={pending || !h.scheduledToday}
        onClick={toggle}
        className={cn(
          "flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full border border-input transition-colors hover:border-brand disabled:cursor-default disabled:opacity-40",
          done && "animate-pop border-brand bg-brand text-brand-foreground hover:border-brand",
        )}
      >
        {done && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px]">{h.name}</p>
        <p className="text-[11px] text-muted-foreground">
          {!h.scheduledToday ? "Not scheduled today" : h.timeOfDay && h.timeOfDay !== "anytime" ? `${h.timeOfDay[0].toUpperCase()}${h.timeOfDay.slice(1)}` : "Any time"}
          {h.streak > 1 && <> · {h.streak}-day run</>}
        </p>
      </div>
      <div className="hidden items-center gap-1 sm:flex" aria-label="Last 7 days">
        {days.map((d) => (
          <span
            key={d.date}
            title={`${formatShortDate(d.date)}: ${d.state === "done" ? "done" : d.state === "missed" ? "missed" : d.state === "off" ? "not scheduled" : d.state === "future" ? "pending" : "before habit started"}`}
            className={cn(
              "size-2.5 rounded-[3px]",
              d.state === "done" && "bg-brand",
              d.state === "missed" && "bg-destructive/25",
              d.state === "off" && "bg-muted",
              d.state === "future" && "border border-dashed border-input",
              d.state === "before" && "bg-transparent",
            )}
          />
        ))}
      </div>
      <div className="w-12 text-right">
        <span className="tabular text-[13px] font-medium">{h.consistency30 === null ? "–" : `${h.consistency30}%`}</span>
      </div>
    </li>
  );
}

export function HabitsWidget({ m }: { m: DashboardModel }) {
  const { habitsDoneToday: d, habitsScheduledToday: s } = m.stats;
  return (
    <WidgetCard
      title="Habits"
      description={s ? `${d} of ${s} done today · % = consistency over 30 days` : undefined}
      href="/habits"
      source={m.habits[0]?.source}
    >
      {m.habits.length ? (
        <ul className="-my-2 divide-y divide-border">{m.habits.map((h) => <HabitRow key={h.id} h={h} />)}</ul>
      ) : (
        <EmptyState compact icon={Repeat} title="No habits yet">
          Start with one small routine. Consistency is tracked as a rate, so a missed day never resets your progress to zero.
        </EmptyState>
      )}
    </WidgetCard>
  );
}

const LEVEL: Record<string, string> = { long_term: "Long-term", annual: "Annual", quarterly: "Quarterly", vision: "Vision" };

export function GoalsWidget({ m }: { m: DashboardModel }) {
  return (
    <WidgetCard title="Goals" href="/goals" source={m.goals[0]?.source}>
      {m.goals.length ? (
        <ul className="space-y-3.5">
          {m.goals.map((g) => (
            <li key={g.id}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-[13px]">{g.title}</p>
                <span className="tabular shrink-0 text-xs text-muted-foreground">{g.pct === null ? "No metric" : `${g.pct}%`}</span>
              </div>
              {g.pct !== null && <Progress value={g.pct} className="mt-1.5" aria-label={`${g.title} progress`} />}
              <p className="mt-1 text-[11px] text-subtle-foreground">
                {LEVEL[g.level]}
                {g.metric_label && g.metric_current !== null && <> · {Number(g.metric_current).toLocaleString()} / {Number(g.metric_target).toLocaleString()} {g.metric_label}</>}
                {g.target_date && <> · target {formatShortDate(g.target_date)}</>}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState compact icon={Target} title="No active goals">Goals link your vision to the projects, habits and tasks that move it forward.</EmptyState>
      )}
    </WidgetCard>
  );
}

export function ProjectsWidget({ m }: { m: DashboardModel }) {
  return (
    <WidgetCard title="Projects" href="/work" source={m.projects[0]?.source}>
      {m.projects.length ? (
        <ul className="space-y-3.5">
          {m.projects.map((p) => (
            <li key={p.id}>
              <div className="flex items-center justify-between gap-3">
                <Link href={`/work?tab=board&project=${p.id}`} className="min-w-0 truncate text-[13px] hover:underline">{p.name}</Link>
                {p.risk === "late" && <Badge variant="danger">Past due</Badge>}
                {p.risk === "watch" && <Badge variant="warning">At risk</Badge>}
              </div>
              <Progress
                value={p.pct ?? 0}
                className="mt-1.5"
                indicatorClassName={p.risk === "late" ? "bg-destructive" : p.risk === "watch" ? "bg-warning" : undefined}
                aria-label={`${p.name} task completion`}
              />
              <p className="mt-1 text-[11px] text-subtle-foreground">
                <span className="tabular">{p.done}/{p.done + p.open}</span> tasks done
                {p.dueDate && <> · due {relativeDay(p.dueDate, m.todayKey)}</>}
                <span className="capitalize"> · {p.area}</span>
                {p.blocked > 0 && <span className="text-warning"> · {p.blocked} blocked</span>}
                {p.overdue > 0 && <span className="text-destructive"> · {p.overdue} overdue</span>}
              </p>
              {p.nextMilestone && (
                <p className="mt-0.5 truncate text-[11px] text-subtle-foreground">
                  Next milestone: <span className="text-muted-foreground">{p.nextMilestone.title}</span> · {relativeDay(p.nextMilestone.dueDate, m.todayKey)}
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState compact icon={FolderKanban} title="No active projects" />
      )}
    </WidgetCard>
  );
}

export function WeekWidget({ m }: { m: DashboardModel }) {
  const w = m.week;
  return (
    <WidgetCard title="This week so far" href={w ? `/reports?period=weekly&date=${w.start}` : "/reports"} hrefLabel="Report"
      description={w ? `${formatShortDate(w.start)} – ${formatShortDate(w.end)} · ${w.daysWithData} of ${w.days} day${w.days === 1 ? "" : "s"} with something logged` : undefined}>
      {!w ? (
        <EmptyState compact icon={BarChart3} title="Couldn't count this week">Open Reports to see the week.</EmptyState>
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          {w.items.map((x) => (
            <li key={x.key} className="min-w-0">
              <Link href={x.href} className="group grid gap-0.5">
                <span className="truncate text-[11px] text-muted-foreground group-hover:text-foreground">{x.label}</span>
                <span className="tabular text-[17px] leading-tight font-semibold tracking-tight">{x.value}</span>
                {x.hint && <span className="truncate text-[11px] text-subtle-foreground">{x.hint}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}
