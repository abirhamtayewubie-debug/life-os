"use client";

import { useState } from "react";
import Link from "next/link";
import { AlarmClock, CalendarPlus, Link2, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { addDays, formatTime, localDateKey } from "@/lib/dates";
import { addSubtask, deleteTask, setDependency } from "@/server/actions/tasks";
import { createReminder, cancelReminder } from "@/server/actions/reminders";
import { useServerAction } from "@/features/dashboard/use-server-action";
import { isOpenTask } from "./filters";
import { TaskForm } from "./task-form";
import { TaskCheckbox } from "./task-list";
import type { ReminderRecord, TaskRecord } from "./types";

function Section({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <h3 className="flex items-center gap-1.5 text-[13px] font-medium"><Icon className="size-3.5 text-muted-foreground" />{title}</h3>
      {children}
    </section>
  );
}

export function TaskDetail({
  task, all, reminders, projects, goals, tz, locale, onClose,
}: {
  task: TaskRecord;
  all: TaskRecord[];
  reminders: ReminderRecord[];
  projects: { id: string; name: string }[];
  goals: { id: string; title: string }[];
  tz: string;
  locale: string;
  onClose: () => void;
}) {
  const { pending, run } = useServerAction();
  const [sub, setSub] = useState("");
  const [dep, setDep] = useState("");
  const today = localDateKey(new Date(), tz);
  const dueKey = task.due_date ?? (task.due_at ? localDateKey(new Date(task.due_at), tz) : null);
  const [remDate, setRemDate] = useState(dueKey && dueKey >= today ? dueKey : today);
  const [remTime, setRemTime] = useState("09:00");

  const subtasks = all.filter((t) => t.parent_task_id === task.id);
  const byId = new Map(all.map((t) => [t.id, t]));
  const dependsOn = task.dependsOn.map((id) => byId.get(id)).filter(Boolean) as TaskRecord[];
  const candidates = all.filter((t) => t.id !== task.id && isOpenTask(t) && !task.dependsOn.includes(t.id) && t.parent_task_id !== task.id);
  const myReminders = reminders.filter((r) => r.task_id === task.id);

  return (
    <div className="grid gap-6">
      <TaskForm task={task} tz={tz} projects={projects} goals={goals} onDone={onClose} onCancel={onClose} />
      <Separator />

      <Section title={`Subtasks${subtasks.length ? ` · ${subtasks.filter((s) => s.status === "done").length}/${subtasks.length}` : ""}`} icon={Plus}>
        {subtasks.length > 0 && (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {subtasks.map((s) => (
              <li key={s.id} className="flex items-center gap-2.5 px-3 py-2 text-[13px]">
                <TaskCheckbox task={s} />
                <span className={s.status === "done" ? "text-muted-foreground line-through" : ""}>{s.title}</span>
              </li>
            ))}
          </ul>
        )}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (sub.trim()) run(() => addSubtask(task.id, sub), { onSuccess: () => setSub(""), quiet: true }); }}>
          <Input value={sub} onChange={(e) => setSub(e.target.value)} placeholder="Add a subtask" aria-label="New subtask" maxLength={300} />
          <Button type="submit" variant="outline" disabled={pending || !sub.trim()}>Add</Button>
        </form>
      </Section>

      <Section title="Waiting on" icon={Link2}>
        {dependsOn.length > 0 && (
          <ul className="grid gap-1.5">
            {dependsOn.map((d) => (
              <li key={d.id} className="flex items-center gap-2 rounded-md bg-muted px-2.5 py-1.5 text-[13px]">
                <span className={isOpenTask(d) ? "" : "text-muted-foreground line-through"}>{d.title}</span>
                <Button variant="ghost" size="icon-sm" className="ml-auto size-6" aria-label={`Remove dependency on ${d.title}`} onClick={() => run(() => setDependency(task.id, d.id, false), { quiet: true })}><X /></Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <NativeSelect value={dep} onChange={(e) => setDep(e.target.value)} aria-label="Task this one waits on">
            <option value="">Choose a task this one waits on…</option>
            {candidates.slice(0, 200).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </NativeSelect>
          <Button variant="outline" disabled={!dep || pending} onClick={() => run(() => setDependency(task.id, dep, true), { onSuccess: () => setDep(""), quiet: true })}>Link</Button>
        </div>
      </Section>

      <Section title="Reminders" icon={AlarmClock}>
        {myReminders.length > 0 && (
          <ul className="grid gap-1.5">
            {myReminders.map((r) => {
              const at = r.snoozed_until ?? r.remind_at;
              return (
                <li key={r.id} className="flex items-center gap-2 rounded-md bg-muted px-2.5 py-1.5 text-[13px]">
                  <span className="tabular">{localDateKey(new Date(at), tz)} · {formatTime(at, tz, locale)}</span>
                  {r.status === "snoozed" && <span className="text-[11px] text-muted-foreground">snoozed</span>}
                  <Button variant="ghost" size="icon-sm" className="ml-auto size-6" aria-label="Remove reminder" onClick={() => run(() => cancelReminder(r.id), { quiet: true })}><X /></Button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <Input type="date" className="w-auto" value={remDate} min={today} max={addDays(today, 730)} onChange={(e) => setRemDate(e.target.value)} aria-label="Reminder date" />
          <Input type="time" className="w-auto" value={remTime} onChange={(e) => setRemTime(e.target.value)} aria-label="Reminder time" />
          <Button variant="outline" disabled={pending} onClick={() => run(() => createReminder({ title: task.title, date: remDate, time: remTime, taskId: task.id }))}>Remind me</Button>
        </div>
        <p className="text-[11px] text-muted-foreground">Reminders show inside Life OS while it&apos;s open. Phone and email alerts come in phase 7.</p>
      </Section>

      <Separator />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/calendar?view=day&date=${dueKey && dueKey >= today ? dueKey : today}&block=${task.id}`}><CalendarPlus /> Block time on calendar</Link>
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="ml-auto text-destructive hover:text-destructive"><Trash2 /> Delete</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>Delete “{task.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the task{subtasks.length ? ` and its ${subtasks.length} subtask${subtasks.length > 1 ? "s" : ""}` : ""}, plus any reminders on it. To keep a record, mark it done or cancelled instead.
            </AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <AlertDialogAction onClick={() => run(() => deleteTask(task.id), { onSuccess: onClose })}>Delete task</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
