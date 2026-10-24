"use client";

import { useOptimistic, useState, useTransition } from "react";
import { DndContext, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Link2, ListTree, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { formatShortDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { createTask, setTaskStatus } from "@/server/actions/tasks";
import { useServerAction } from "@/features/dashboard/use-server-action";
import { blockersOf } from "@/features/tasks/filters";
import { PRIORITY_LABEL } from "@/features/tasks/types";
import { boardOrder, subtaskCounts, taskDueKey } from "./stats";
import { BOARD_COLUMNS, BOARD_LABEL, type BoardStatus, type ProjectRecord, type ProjectTask } from "./types";

/** Done cards shown per column before "show all", so a long history doesn't bury the board. */
const DONE_LIMIT = 20;

/**
 * Kanban of project tasks: one project, or every project when `projectId` is
 * null. Drag a card (mouse, touch or keyboard: space to lift, arrows, space to
 * drop) or use its menu. Cards are the same task rows as Tasks & Reminders.
 */
export function ProjectBoard({
  projectId, projects, tasks, today, tz, locale, onOpenTask,
}: {
  projectId: string | null;
  projects: ProjectRecord[];
  tasks: ProjectTask[];
  today: string;
  tz: string;
  locale: string;
  onOpenTask: (id: string) => void;
}) {
  const mine = tasks.filter((t) => (projectId === null || t.project_id === projectId) && !t.parent_task_id && t.status !== "cancelled");
  const [optimistic, move] = useOptimistic(mine, (state, { id, status }: { id: string; status: BoardStatus }) => state.map((t) => (t.id === id ? { ...t, status } : t)));
  const [, start] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const subs = subtaskCounts(tasks);
  const names = new Map(projects.map((p) => [p.id, p.name]));

  const moveTo = (id: string, status: BoardStatus) => {
    const t = optimistic.find((x) => x.id === id);
    if (!t || t.status === status) return;
    const blockers = blockersOf(t, byId);
    start(async () => {
      move({ id, status });
      const r = await setTaskStatus(id, status);
      if (!r.ok) toast(r.error);
      else if (blockers.length && status !== "waiting") toast(`Still waiting on ${blockers.map((b) => `“${b.title}”`).join(", ")}.`);
    });
  };

  const onDragEnd = (e: DragEndEvent) => {
    if (e.over) moveTo(String(e.active.id), e.over.id as BoardStatus);
  };

  return (
    <DndContext id="project-board" sensors={sensors} onDragEnd={onDragEnd} accessibility={{ screenReaderInstructions: { draggable: "Press space to pick up a task, arrow keys to move it to another column, space to drop." } }}>
      <div className="grid grid-cols-[repeat(4,minmax(15rem,1fr))] gap-3 overflow-x-auto pb-2">
        {BOARD_COLUMNS.map((c) => (
          <Column
            key={c.status} status={c.status} label={c.label}
            tasks={optimistic.filter((t) => t.status === c.status).sort((a, b) => boardOrder(a, b, tz))}
            projectId={projectId}
            card={(t) => (
              <TaskCard
                key={t.id} t={t} today={today} tz={tz} locale={locale}
                project={projectId === null ? names.get(t.project_id!) ?? null : null}
                subtasks={subs.get(t.id)} blockers={blockersOf(t, byId).length}
                onMove={moveTo} onOpen={() => onOpenTask(t.id)}
              />
            )}
          />
        ))}
      </div>
    </DndContext>
  );
}

function Column({
  status, label, tasks, projectId, card,
}: {
  status: BoardStatus; label: string; tasks: ProjectTask[]; projectId: string | null;
  card: (t: ProjectTask) => React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const [title, setTitle] = useState("");
  const [showAll, setShowAll] = useState(false);
  const { pending, run } = useServerAction();
  const shown = status === "done" && !showAll ? tasks.slice(0, DONE_LIMIT) : tasks;
  return (
    <section ref={setNodeRef} aria-label={`${label} column`} className={cn("flex min-h-48 flex-col gap-2 rounded-xl border border-border bg-muted/40 p-2 transition-colors", isOver && "border-brand/60 bg-accent/40")}>
      <h3 className="flex items-center gap-2 px-1.5 pt-1 text-[12px] font-medium text-muted-foreground">
        {label} <span className="tabular text-subtle-foreground">{tasks.length}</span>
      </h3>
      {status !== "done" && projectId && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim()) run(() => createTask({ title, projectId, status, area: "work" }), { quiet: true, onSuccess: () => setTitle("") });
          }}
          className="flex gap-1"
        >
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} placeholder="Add a task" aria-label={`Add a task to ${label}`} className="h-8 bg-surface text-[13px]" />
          <Button type="submit" size="icon-sm" variant="ghost" disabled={pending || !title.trim()} aria-label="Add"><Plus /></Button>
        </form>
      )}
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5">{shown.map(card)}</ul>
      {shown.length < tasks.length && (
        <button type="button" onClick={() => setShowAll(true)} className="cursor-pointer px-1.5 text-left text-[12px] text-muted-foreground hover:text-foreground">
          Show {tasks.length - shown.length} older
        </button>
      )}
    </section>
  );
}

const PRIORITY_TONE: Record<number, string> = { 1: "text-destructive", 2: "text-warning" };

function TaskCard({
  t, today, tz, locale, project, subtasks, blockers, onMove, onOpen,
}: {
  t: ProjectTask; today: string; tz: string; locale: string; project: string | null;
  subtasks?: { done: number; total: number }; blockers: number;
  onMove: (id: string, s: BoardStatus) => void; onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: t.id });
  const due = taskDueKey(t, tz);
  const late = due && due < today && t.status !== "done";
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn("flex items-start gap-1.5 rounded-2xl border border-border bg-surface p-2 text-[13px] shadow-card", isDragging && "z-10 opacity-80 shadow-lg")}
    >
      <button type="button" className="mt-0.5 cursor-grab touch-none text-subtle-foreground active:cursor-grabbing" aria-label={`Drag ${t.title}`} {...attributes} {...listeners}>
        <GripVertical className="size-3.5" />
      </button>
      <div className="min-w-0 flex-1">
        <button type="button" onClick={onOpen} className={cn("block cursor-pointer text-left leading-snug hover:underline", t.status === "done" && "text-muted-foreground line-through")}>{t.title}</button>
        {project && <span className="mt-0.5 block truncate text-[11px] text-subtle-foreground">{project}</span>}
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          {t.priority <= 2 && <span className={cn("font-medium", PRIORITY_TONE[t.priority])}>{PRIORITY_LABEL[t.priority]}</span>}
          {due && <span className={cn(late && "text-destructive")}>{late ? "Overdue · " : ""}{formatShortDate(due, locale)}</span>}
          {subtasks && (
            <span className="inline-flex items-center gap-1" title="Subtasks done"><ListTree className="size-3" aria-hidden /><span className="tabular">{subtasks.done}/{subtasks.total}</span></span>
          )}
          {blockers > 0 && t.status !== "done" && <Badge variant="warning"><Link2 aria-hidden />Waiting on {blockers}</Badge>}
        </span>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="size-6" aria-label={`Move ${t.title}`}><MoreHorizontal /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onOpen}>Open details</DropdownMenuItem>
          <DropdownMenuLabel>Move to</DropdownMenuLabel>
          {BOARD_COLUMNS.filter((c) => c.status !== t.status).map((c) => (
            <DropdownMenuItem key={c.status} onSelect={() => onMove(t.id, c.status)}>{BOARD_LABEL[c.status]}</DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
