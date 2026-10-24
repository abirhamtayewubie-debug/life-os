"use client";

import { useState } from "react";
import { Check, Link2, ListTree, Repeat, Star } from "lucide-react";
import { ProvenanceBadge } from "@/components/data/provenance";
import { Badge } from "@/components/ui/badge";
import { diffDays, formatShortDate, formatTime, localDateKey } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { setTaskStatus } from "@/server/actions/tasks";
import { useServerAction } from "@/features/dashboard/use-server-action";
import { blockersOf, dueKeyOf, isTaskOverdue } from "./filters";
import { PRIORITY_LABEL, type TaskRecord } from "./types";

const DOT: Record<number, string> = { 1: "bg-destructive", 2: "bg-warning", 3: "bg-chart-5/60", 4: "bg-border" };

export function TaskCheckbox({ task, className }: { task: TaskRecord; className?: string }) {
  const [done, setDone] = useState(task.status === "done");
  const { pending, run } = useServerAction();
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={`Mark “${task.title}” ${done ? "not done" : "done"}`}
      disabled={pending}
      onClick={(e) => {
        e.stopPropagation();
        const next = !done;
        setDone(next);
        run(() => setTaskStatus(task.id, next ? "done" : "todo"), { onError: () => setDone(!next) });
      }}
      className={cn(
        "relative flex size-[22px] shrink-0 cursor-pointer items-center justify-center rounded-full border-[1.5px] border-input transition-colors before:absolute before:-inset-2.5 before:content-[''] hover:border-brand",
        done && "animate-pop border-brand bg-brand text-brand-foreground",
        className,
      )}
    >
      {done && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
    </button>
  );
}

export function dueText(t: TaskRecord, now: Date, tz: string, locale: string): string | null {
  const k = dueKeyOf(t, tz);
  if (!k) return null;
  const today = localDateKey(now, tz);
  const d = diffDays(today, k);
  const time = t.due_at ? ` ${formatTime(t.due_at, tz, locale)}` : "";
  if (d === 0) return `Today${time}`;
  if (d === 1) return `Tomorrow${time}`;
  if (d === -1) return `Yesterday${time}`;
  if (d < 0) return `${-d} days overdue`;
  if (d < 7) return `${new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(new Date(`${k}T12:00:00Z`))}${time}`;
  return `${formatShortDate(k, locale)}${time}`;
}

export function TaskItem({ task, all, now, tz, locale, onOpen }: { task: TaskRecord; all: TaskRecord[]; now: Date; tz: string; locale: string; onOpen: (t: TaskRecord) => void }) {
  const byId = new Map(all.map((t) => [t.id, t]));
  const subtasks = all.filter((t) => t.parent_task_id === task.id);
  const blockers = blockersOf(task, byId);
  const overdue = isTaskOverdue(task, now, tz);
  const due = dueText(task, now, tz, locale);
  return (
    <li className="group flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/60">
      <TaskCheckbox task={task} className="mt-0.5" />
      <button type="button" onClick={() => onOpen(task)} className="min-w-0 flex-1 cursor-pointer text-left outline-none">
        <span className={cn("flex items-center gap-1.5 text-[13px] leading-snug", task.status === "done" && "text-muted-foreground line-through")}>
          {task.is_top_priority && <Star className="size-3 shrink-0 fill-brand text-brand" aria-label="Today's focus" />}
          <span className="truncate">{task.title}</span>
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><span className={cn("size-1.5 rounded-full", DOT[task.priority])} aria-hidden />{PRIORITY_LABEL[task.priority]}</span>
          {due && <span className={cn(overdue && "font-medium text-destructive")}>{due}</span>}
          {task.recurrence_rule && <Repeat className="size-3" aria-label="Repeats" />}
          {subtasks.length > 0 && (
            <span className="inline-flex items-center gap-1"><ListTree className="size-3" aria-hidden />{subtasks.filter((s) => s.status === "done").length}/{subtasks.length}</span>
          )}
          {blockers.length > 0 && <Badge variant="warning"><Link2 aria-hidden />Waiting on {blockers.length}</Badge>}
          {task.status === "in_progress" && <Badge variant="brand">Doing</Badge>}
          {task.status === "waiting" && <Badge variant="warning">Blocked</Badge>}
          <span className="capitalize">{task.area}</span>
          {task.tags.map((g) => <span key={g.id} className="rounded bg-muted px-1.5 py-px text-[10px]">#{g.name}</span>)}
          <ProvenanceBadge source={task.source} />
        </span>
      </button>
    </li>
  );
}
