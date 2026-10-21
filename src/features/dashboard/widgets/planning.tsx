"use client";

import { AlarmClock, CalendarPlus, CheckCircle2, Clock, ListChecks, MapPin, Sunrise } from "lucide-react";
import { EmptyState } from "@/components/data/empty-state";
import { Badge } from "@/components/ui/badge";
import { formatShortDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { findConflicts, type DashboardModel, type EventView } from "../compute";
import { TaskRow } from "./task-row";
import { WidgetCard } from "./widget-card";

export function BriefingWidget({ m }: { m: DashboardModel }) {
  return (
    <WidgetCard
      title="Morning briefing"
      description={<span className="inline-flex items-center gap-1"><Sunrise className="size-3" aria-hidden /> Built from your records · no AI involved</span>}
    >
      <div className="grid gap-5 md:grid-cols-[1.3fr_1fr]">
        <ul className="space-y-2">
          {m.briefing.lines.map((l) => (
            <li key={l} className="flex gap-2.5 text-[13px] leading-relaxed text-foreground">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-brand" aria-hidden />
              {l}
            </li>
          ))}
        </ul>
        <div className="rounded-lg border border-border bg-surface-2/60 p-3.5">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Suggested focus</p>
          {m.briefing.suggestedPriorities.length ? (
            <ol className="mt-2 space-y-1.5">
              {m.briefing.suggestedPriorities.map((t, i) => (
                <li key={t.id} className="flex gap-2 text-[13px]">
                  <span className="tabular w-4 shrink-0 font-medium text-brand">{i + 1}</span>
                  <span className="min-w-0">
                    {t.title}
                    {t.late && <span className="ml-1.5 text-[11px] text-destructive">overdue</span>}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">Nothing urgent. A good day to make progress on a goal.</p>
          )}
          <p className="mt-3 text-[11px] text-subtle-foreground">Three items at most, picked from top priorities, urgent overdue work and today&apos;s deadlines.</p>
        </div>
      </div>
    </WidgetCard>
  );
}

export function PrioritiesWidget({ m }: { m: DashboardModel }) {
  return (
    <WidgetCard title="Today's priorities" href="/tasks" source={m.priorities[0]?.source}>
      {m.priorities.length ? (
        <ul className="-my-2 divide-y divide-border">
          {m.priorities.map((t) => <TaskRow key={t.id} task={t} />)}
        </ul>
      ) : (
        <EmptyState compact icon={ListChecks} title="No priorities set for today">
          Flag up to three tasks as today&apos;s focus, or give a task high priority and a due date of today.
        </EmptyState>
      )}
    </WidgetCard>
  );
}

function EventRow({ e, conflict }: { e: EventView; conflict?: boolean }) {
  const tone = e.kind === "time_block" ? "bg-chart-2" : e.kind === "meeting" ? "bg-chart-1" : e.kind === "appointment" ? "bg-chart-4" : "bg-chart-3";
  return (
    <li className="flex gap-3 py-2">
      <div className={cn("w-0.5 shrink-0 self-stretch rounded-full", tone)} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[13px] font-medium">{e.title}</p>
          {conflict && <Badge variant="warning">Overlaps</Badge>}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
          <span className="tabular inline-flex items-center gap-1"><Clock className="size-3" aria-hidden />{e.timeLabel}</span>
          {e.location && <span className="inline-flex items-center gap-1 truncate"><MapPin className="size-3" aria-hidden />{e.location}</span>}
          {e.kind === "time_block" && <span>Focus block</span>}
        </div>
      </div>
    </li>
  );
}

export function AgendaWidget({ m }: { m: DashboardModel }) {
  const conflictIds = new Set(findConflicts(m.agenda).flat().map((e) => e.id));
  const source = m.agenda[0]?.source ?? m.upcoming[0]?.source;
  return (
    <WidgetCard title="Agenda" href="/calendar" source={source}>
      {m.agenda.length ? (
        <ul className="-my-2">{m.agenda.map((e) => <EventRow key={e.id} e={e} conflict={conflictIds.has(e.id)} />)}</ul>
      ) : (
        <EmptyState compact icon={CalendarPlus} title="Nothing scheduled today">
          Events you add, or sync from a connected calendar later, appear here.
        </EmptyState>
      )}
      {m.upcoming.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Next 7 days</p>
          <ul className="space-y-1.5">
            {m.upcoming.slice(0, 4).map((e) => (
              <li key={e.id} className="flex items-center gap-3 text-[13px]">
                <span className="tabular w-14 shrink-0 text-xs text-muted-foreground">{formatShortDate(e.dateKey)}</span>
                <span className="truncate">{e.title}</span>
                <span className="tabular ml-auto shrink-0 text-[11px] text-subtle-foreground">{e.all_day ? "All day" : e.timeLabel.split(" – ")[0]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </WidgetCard>
  );
}

export function DeadlinesWidget({ m }: { m: DashboardModel }) {
  const empty = !m.overdue.length && !m.dueSoon.length;
  return (
    <WidgetCard
      title="Overdue & due soon"
      href="/tasks"
      source={m.overdue[0]?.source ?? m.dueSoon[0]?.source}
      actions={m.overdue.length ? <Badge variant="danger">{m.overdue.length} overdue</Badge> : undefined}
    >
      {empty ? (
        <EmptyState compact icon={CheckCircle2} title="You're clear">No overdue tasks and nothing due in the next three days.</EmptyState>
      ) : (
        <div className="space-y-3">
          {m.overdue.length > 0 && (
            <ul className="-my-2 divide-y divide-border">{m.overdue.slice(0, 4).map((t) => <TaskRow key={t.id} task={t} />)}</ul>
          )}
          {m.dueSoon.length > 0 && (
            <div className={cn(m.overdue.length > 0 && "border-t border-border pt-2")}>
              <p className="mb-0.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Due in the next 3 days</p>
              <ul className="divide-y divide-border">{m.dueSoon.slice(0, 4).map((t) => <TaskRow key={t.id} task={t} />)}</ul>
            </div>
          )}
        </div>
      )}
    </WidgetCard>
  );
}

export function RemindersWidget({ m }: { m: DashboardModel }) {
  return (
    <WidgetCard title="Reminders" href="/tasks" source={m.reminders[0]?.source}>
      {m.reminders.length ? (
        <ul className="space-y-2">
          {m.reminders.map((r) => (
            <li key={r.id} className="flex items-center gap-2.5 text-[13px]">
              <AlarmClock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{r.title}</span>
              {r.snoozed && <Badge variant="outline">Snoozed</Badge>}
              <span className="tabular text-xs text-muted-foreground">{r.timeLabel}</span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState compact icon={AlarmClock} title="No reminders today" />
      )}
      <p className="mt-3 border-t border-border pt-2.5 text-[11px] leading-relaxed text-subtle-foreground">
        Reminders currently appear only while the app is open. Push and email delivery arrive in phase 7, once verified end to end.
      </p>
    </WidgetCard>
  );
}


