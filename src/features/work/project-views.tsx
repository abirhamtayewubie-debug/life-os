"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Diamond, Flag, Link2, ListTree, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/input";
import { addDays, formatShortDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { setTaskStatus } from "@/server/actions/tasks";
import { shiftMonth } from "@/features/finance/ledger";
import { blockersOf } from "@/features/tasks/filters";
import { TaskCheckbox } from "@/features/tasks/task-list";
import { PRIORITY_LABEL } from "@/features/tasks/types";
import { boardOrder, projectDeadlines, subtaskCounts, taskDueKey, weekStart, type Deadline } from "./stats";
import { BOARD_COLUMNS, BOARD_LABEL, type BoardStatus, type ProjectTask, type WorkWorkspace } from "./types";

type Sort = "due" | "priority" | "status" | "project";
const STATUS_ORDER: Record<string, number> = { in_progress: 0, waiting: 1, todo: 2, done: 3, cancelled: 4 };
const DOT: Record<number, string> = { 1: "bg-destructive", 2: "bg-warning", 3: "bg-chart-5/60", 4: "bg-border" };

/** Project tasks as a sortable list, with status changes in place. */
export function TaskListView({ ws, projectId, onOpenTask }: { ws: WorkWorkspace; projectId: string | null; onOpenTask: (id: string) => void }) {
  const [sort, setSort] = useState<Sort>("due");
  const [showDone, setShowDone] = useState(false);
  const byId = new Map(ws.tasks.map((t) => [t.id, t]));
  const subs = subtaskCounts(ws.tasks);
  const names = new Map(ws.projects.map((p) => [p.id, p.name]));
  const rows = ws.tasks
    .filter((t) => (projectId === null || t.project_id === projectId) && !t.parent_task_id && t.status !== "cancelled" && (showDone || t.status !== "done"))
    .sort((a, b) => {
      const due = (taskDueKey(a, ws.timezone) ?? "9999").localeCompare(taskDueKey(b, ws.timezone) ?? "9999");
      switch (sort) {
        case "priority": return a.priority - b.priority || due;
        case "status": return STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || boardOrder(a, b, ws.timezone);
        case "project": return (names.get(a.project_id!) ?? "").localeCompare(names.get(b.project_id!) ?? "") || due;
        default: return due || a.priority - b.priority;
      }
    });

  return (
    <Card className="grid gap-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">Sort by</span>
          <NativeSelect className="h-8 w-auto" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort tasks">
            <option value="due">Deadline</option>
            <option value="priority">Priority</option>
            <option value="status">Status</option>
            {projectId === null && <option value="project">Project</option>}
          </NativeSelect>
        </label>
        <label className="ml-auto flex items-center gap-2">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="size-4 accent-[var(--brand)]" />
          Show done
        </label>
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">{showDone ? "No tasks in this view." : "No open tasks. Add one from the board or with New task."}</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((t) => (
            <ListRow key={t.id} t={t} ws={ws} project={projectId === null ? names.get(t.project_id!) ?? null : null} subtasks={subs.get(t.id)} blockers={blockersOf(t, byId).length} onOpen={() => onOpenTask(t.id)} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function ListRow({ t, ws, project, subtasks, blockers, onOpen }: {
  t: ProjectTask; ws: WorkWorkspace; project: string | null; subtasks?: { done: number; total: number }; blockers: number; onOpen: () => void;
}) {
  const [status, setStatus] = useState(t.status);
  const due = taskDueKey(t, ws.timezone);
  const late = due && due < ws.today && t.status !== "done";
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 sm:flex-nowrap">
      <TaskCheckbox task={t} />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 cursor-pointer text-left">
        <span className={cn("block truncate text-[13px] leading-snug hover:underline", t.status === "done" && "text-muted-foreground line-through")}>{t.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
          {project && <span className="truncate">{project}</span>}
          <span className="inline-flex items-center gap-1"><span className={cn("size-1.5 rounded-full", DOT[t.priority])} aria-hidden />{PRIORITY_LABEL[t.priority]}</span>
          {subtasks && <span className="inline-flex items-center gap-1"><ListTree className="size-3" aria-hidden /><span className="tabular">{subtasks.done}/{subtasks.total}</span></span>}
          {blockers > 0 && t.status !== "done" && <Badge variant="warning"><Link2 aria-hidden />Waiting on {blockers}</Badge>}
        </span>
      </button>
      <span className={cn("tabular w-24 shrink-0 text-[12px] text-muted-foreground sm:text-right", late && "font-medium text-destructive")}>
        {due ? `${late ? "Overdue · " : ""}${formatShortDate(due, ws.locale)}` : "No date"}
      </span>
      <NativeSelect
        aria-label={`Status of ${t.title}`}
        className="h-8 w-28 shrink-0 text-[12px]"
        value={status}
        onChange={async (e) => {
          const next = e.target.value as BoardStatus;
          const prev = status;
          setStatus(next);
          const r = await setTaskStatus(t.id, next);
          if (!r.ok) { setStatus(prev); toast(r.error); }
        }}
      >
        {BOARD_COLUMNS.map((c) => <option key={c.status} value={c.status}>{BOARD_LABEL[c.status]}</option>)}
      </NativeSelect>
    </li>
  );
}

const KIND_ICON: Record<Deadline["kind"], React.ComponentType<{ className?: string }>> = { task: ListTree, milestone: Diamond, start: PlayCircle, due: Flag };

/**
 * Month of project dates: task deadlines, milestones, project starts and due
 * dates. A grid on wide screens, an agenda list on phones.
 */
export function DeadlineCalendar({ ws, projectId, onOpenTask, onOpenProject }: {
  ws: WorkWorkspace; projectId: string | null; onOpenTask: (id: string) => void; onOpenProject: (id: string) => void;
}) {
  const [month, setMonth] = useState(ws.today.slice(0, 7));
  const first = `${month}-01`;
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  const gridStart = weekStart(first);
  const gridEnd = addDays(weekStart(last), 6);
  const items = projectDeadlines(ws, gridStart, gridEnd, ws.timezone, projectId);
  const byDay = new Map<string, Deadline[]>();
  for (const d of items) byDay.set(d.date, [...(byDay.get(d.date) ?? []), d]);
  const days: string[] = [];
  for (let k = gridStart; k <= gridEnd; k = addDays(k, 1)) days.push(k);
  const monthItems = items.filter((d) => d.date >= first && d.date <= last);
  const title = new Intl.DateTimeFormat(ws.locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${first}T12:00:00Z`));
  const weekdays = days.slice(0, 7).map((k) => new Intl.DateTimeFormat(ws.locale, { weekday: "short", timeZone: "UTC" }).format(new Date(`${k}T12:00:00Z`)));
  const open = (d: Deadline) => (d.taskId ? onOpenTask(d.taskId) : onOpenProject(d.projectId));

  const Item = ({ d, compact }: { d: Deadline; compact?: boolean }) => {
    const Icon = KIND_ICON[d.kind];
    const late = !d.done && d.date < ws.today && d.kind !== "start";
    return (
      <button
        type="button"
        onClick={() => open(d)}
        title={d.title}
        className={cn(
          "flex w-full min-w-0 cursor-pointer items-center gap-1 rounded px-1 text-left hover:bg-muted",
          compact ? "text-[11px] leading-5" : "py-1 text-[13px]",
          d.done && "text-muted-foreground line-through",
          late && "text-destructive",
          (d.kind === "due" || d.kind === "milestone") && !d.done && !late && "font-medium",
        )}
      >
        <Icon className={cn("size-3 shrink-0", d.kind === "milestone" && "text-warning", d.kind === "due" && "text-brand")} aria-hidden />
        <span className="truncate">{d.title}</span>
      </button>
    );
  };

  return (
    <Card className="grid gap-3 p-3 sm:p-4">
      <div className="flex items-center gap-2">
        <h3 className="text-[14px] font-medium">{title}</h3>
        <span className="ml-auto flex gap-1">
          <Button variant="outline" size="icon-sm" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft /></Button>
          <Button variant="outline" size="sm" onClick={() => setMonth(ws.today.slice(0, 7))}>Today</Button>
          <Button variant="outline" size="icon-sm" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight /></Button>
        </span>
      </div>

      <div className="hidden md:block">
        <div className="grid grid-cols-7 border-b border-border pb-1 text-[11px] text-muted-foreground">
          {weekdays.map((w) => <span key={w} className="px-1">{w}</span>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((k) => {
            const list = byDay.get(k) ?? [];
            const out = k < first || k > last;
            return (
              <div key={k} className={cn("min-h-24 border-r border-b border-border p-1 [&:nth-child(7n)]:border-r-0", out && "bg-muted/30")}>
                <span className={cn("tabular mb-0.5 inline-flex size-5 items-center justify-center rounded-full text-[11px] text-muted-foreground", k === ws.today && "bg-brand font-medium text-brand-foreground", out && "opacity-60")}>
                  {Number(k.slice(8))}
                </span>
                {list.slice(0, 3).map((d) => <Item key={d.key} d={d} compact />)}
                {list.length > 3 && <span className="px-1 text-[11px] text-muted-foreground">+{list.length - 3} more</span>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="md:hidden">
        {monthItems.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted-foreground">Nothing dated this month.</p>
        ) : (
          <ul className="grid gap-3">
            {[...new Set(monthItems.map((d) => d.date))].map((k) => (
              <li key={k}>
                <p className={cn("text-[12px] font-medium text-muted-foreground", k === ws.today && "text-brand")}>{formatShortDate(k, ws.locale)}{k === ws.today ? " · Today" : ""}</p>
                <div className="mt-1 grid">{(byDay.get(k) ?? []).map((d) => <Item key={d.key} d={d} />)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Flag className="size-3 text-brand" aria-hidden /> Project due</span>
        <span className="inline-flex items-center gap-1"><Diamond className="size-3 text-warning" aria-hidden /> Milestone</span>
        <span className="inline-flex items-center gap-1"><PlayCircle className="size-3" aria-hidden /> Project starts</span>
        <span className="inline-flex items-center gap-1"><ListTree className="size-3" aria-hidden /> Task deadline</span>
        {monthItems.length === 0 && <span className="hidden md:inline">Nothing dated this month.</span>}
      </p>
    </Card>
  );
}
