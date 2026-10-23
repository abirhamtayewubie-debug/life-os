"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { DndContext, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createTask, setTaskStatus } from "@/server/actions/tasks";
import { useServerAction } from "@/features/dashboard/use-server-action";
import { PRIORITY_LABEL } from "@/features/tasks/types";
import { BOARD_COLUMNS, type ProjectTask } from "./types";

type Status = (typeof BOARD_COLUMNS)[number]["status"];

/**
 * Kanban for one project's top-level tasks. Drag a card (mouse, touch or
 * keyboard: space to lift, arrows, space to drop) or use its menu.
 */
export function ProjectBoard({ projectId, tasks, today }: { projectId: string; tasks: ProjectTask[]; today: string }) {
  const mine = tasks.filter((t) => t.project_id === projectId && !t.parent_task_id && t.status !== "cancelled");
  const [optimistic, move] = useOptimistic(mine, (state, { id, status }: { id: string; status: Status }) => state.map((t) => (t.id === id ? { ...t, status } : t)));
  const [, start] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  const moveTo = (id: string, status: Status) => {
    const t = optimistic.find((x) => x.id === id);
    if (!t || t.status === status) return;
    start(async () => {
      move({ id, status });
      const r = await setTaskStatus(id, status);
      if (!r.ok) toast(r.error);
    });
  };

  const onDragEnd = (e: DragEndEvent) => {
    if (e.over) moveTo(String(e.active.id), e.over.id as Status);
  };

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd} accessibility={{ screenReaderInstructions: { draggable: "Press space to pick up a task, arrow keys to move it to another column, space to drop." } }}>
      <div className="grid grid-cols-[repeat(4,minmax(15rem,1fr))] gap-3 overflow-x-auto pb-2">
        {BOARD_COLUMNS.map((c) => (
          <Column key={c.status} status={c.status} label={c.label} tasks={optimistic.filter((t) => t.status === c.status)} projectId={projectId} today={today} onMove={moveTo} />
        ))}
      </div>
    </DndContext>
  );
}

function Column({ status, label, tasks, projectId, today, onMove }: { status: Status; label: string; tasks: ProjectTask[]; projectId: string; today: string; onMove: (id: string, s: Status) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const [title, setTitle] = useState("");
  const { pending, run } = useServerAction();
  return (
    <section ref={setNodeRef} aria-label={`${label} column`} className={cn("flex min-h-48 flex-col gap-2 rounded-xl border border-border bg-muted/40 p-2 transition-colors", isOver && "border-brand/60 bg-accent/40")}>
      <h3 className="flex items-center gap-2 px-1.5 pt-1 text-[12px] font-medium text-muted-foreground">
        {label} <span className="tabular text-subtle-foreground">{tasks.length}</span>
      </h3>
      {status !== "done" && (
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
      <ul className="grid gap-1.5">
        {tasks.map((t) => <Card key={t.id} t={t} today={today} onMove={onMove} />)}
      </ul>
    </section>
  );
}

function Card({ t, today, onMove }: { t: ProjectTask; today: string; onMove: (id: string, s: Status) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: t.id });
  const due = t.due_date ?? t.due_at?.slice(0, 10) ?? null;
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
        <Link href={`/tasks?view=all&open=${t.id}`} className={cn("block leading-snug hover:underline", t.status === "done" && "text-muted-foreground line-through")}>{t.title}</Link>
        <span className="mt-0.5 flex gap-2 text-[11px] text-muted-foreground">
          {t.priority <= 2 && <span>{PRIORITY_LABEL[t.priority as 1 | 2]}</span>}
          {due && <span className={cn(late && "text-destructive")}>{late ? "Overdue · " : ""}{due.slice(5)}</span>}
        </span>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="size-6" aria-label={`Move ${t.title}`}><MoreHorizontal /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Move to</DropdownMenuLabel>
          {BOARD_COLUMNS.filter((c) => c.status !== t.status).map((c) => (
            <DropdownMenuItem key={c.status} onSelect={() => onMove(t.id, c.status)}>{c.label}</DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
