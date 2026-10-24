"use client";

import { useState } from "react";
import { BellRing, Repeat, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { addDays, localDateKey } from "@/lib/dates";
import { describeRule, parseRule, presetFromRule, ruleFromPreset, type RepeatPreset } from "@/lib/recurrence";
import { cn } from "@/lib/utils";
import { createReminder } from "@/server/actions/reminders";
import { createTask, updateTask, type TaskInput } from "@/server/actions/tasks";
import { useServerAction } from "@/features/dashboard/use-server-action";
import { AREAS, PRIORITY_LABEL, type Priority, type TaskRecord } from "./types";

type Errors = Record<string, string[] | undefined>;

function initial(task: TaskRecord | null, tz: string, defaults: Partial<TaskInput>): TaskInput {
  if (!task) return { title: "", notes: "", priority: 3, area: "personal", status: "todo", dueDate: "", dueTime: "", isTopPriority: false, recurrenceRule: "", projectId: "", goalId: "", parentTaskId: "", tags: [], ...defaults };
  const timed = task.due_at ? new Date(task.due_at) : null;
  return {
    title: task.title,
    notes: task.notes ?? "",
    priority: task.priority,
    area: task.area as TaskInput["area"],
    status: task.status === "done" || task.status === "cancelled" ? "todo" : task.status,
    dueDate: task.due_date ?? (timed ? localDateKey(timed, tz) : ""),
    dueTime: timed ? new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(timed) : "",
    isTopPriority: task.is_top_priority,
    recurrenceRule: task.recurrence_rule ?? "",
    estimateMinutes: task.estimate_minutes ?? undefined,
    projectId: task.project_id ?? "",
    goalId: task.goal_id ?? "",
    parentTaskId: task.parent_task_id ?? "",
    tags: task.tags.map((t) => t.name),
  };
}

const REPEATS: { v: RepeatPreset; label: string }[] = [
  { v: "none", label: "Doesn't repeat" },
  { v: "daily", label: "Every day" },
  { v: "weekdays", label: "Every weekday" },
  { v: "weekly", label: "Every week" },
  { v: "biweekly", label: "Every 2 weeks" },
  { v: "monthly", label: "Every month" },
  { v: "yearly", label: "Every year" },
];

export function TaskForm({
  task, tz, projects, goals = [], defaults = {}, onDone, onCancel,
}: {
  task: TaskRecord | null;
  tz: string;
  projects: { id: string; name: string }[];
  goals?: { id: string; title: string }[];
  defaults?: Partial<TaskInput>;
  onDone: (id?: string) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState<TaskInput>(() => initial(task, tz, defaults));
  const [tagText, setTagText] = useState((v.tags ?? []).join(", "));
  const [errors, setErrors] = useState<Errors>({});
  const { pending, run } = useServerAction();
  const set = <K extends keyof TaskInput>(k: K, val: TaskInput[K]) => setV((s) => ({ ...s, [k]: val }));
  // New tasks can get a reminder in the same step; existing ones manage reminders in their details.
  const today = localDateKey(new Date(), tz);
  const [rem, setRem] = useState({ on: false, date: today, time: "09:00", devices: true });
  const toggleReminder = (on: boolean) => setRem((r) => (on ? { ...r, on, date: v.dueDate && v.dueDate >= today ? v.dueDate : today, time: v.dueTime || r.time } : { ...r, on }));

  const preset = presetFromRule(v.recurrenceRule);
  const ruleText = (() => {
    try {
      return v.recurrenceRule ? describeRule(parseRule(v.recurrenceRule)) : null;
    } catch {
      return null;
    }
  })();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    if (!task && rem.on && (!rem.date || !rem.time)) return setErrors({ reminder: ["Pick a date and time for the reminder."] });
    const payload = { ...v, tags: tagText.split(",").map((t) => t.trim()).filter(Boolean) };
    run(
      async () => {
        const r = task ? await updateTask(task.id, payload) : await createTask(payload);
        if (!r.ok && r.fieldErrors) setErrors(r.fieldErrors);
        const id = r.ok ? (r.data as { id?: string } | undefined)?.id : undefined;
        if (!task && rem.on && r.ok && id) {
          // The task exists either way, so a failed reminder is reported without undoing it.
          const rr = await createReminder({ title: payload.title, date: rem.date, time: rem.time, taskId: id, notifyDevices: rem.devices });
          return { ...r, message: rr.ok ? `Task added. ${rr.message}` : "Task added, but the reminder couldn't be saved. Open the task to add one." };
        }
        return r;
      },
      { onSuccess: (r) => onDone((r.data as { id?: string } | undefined)?.id) },
    );
  };

  const err = (k: string) => errors[k]?.[0];

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <div className="grid gap-1.5">
        <Label htmlFor="task-title">Title</Label>
        <Input id="task-title" autoFocus value={v.title} maxLength={300} onChange={(e) => set("title", e.target.value)} aria-invalid={!!err("title")} placeholder="What needs doing?" />
        {err("title") && <p className="text-xs text-destructive">{err("title")}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="task-due">Due date</Label>
          <Input id="task-due" type="date" value={v.dueDate} onChange={(e) => {
            const d = e.target.value;
            setV((s) => {
              // Keep weekday / day-of-month presets aligned with the new date.
              const p = presetFromRule(s.recurrenceRule);
              const rule = d && p !== "none" && p !== "custom" ? ruleFromPreset(p, d) ?? "" : s.recurrenceRule;
              return { ...s, dueDate: d, recurrenceRule: rule };
            });
          }} aria-invalid={!!err("dueDate")} />
          {err("dueDate") && <p className="text-xs text-destructive">{err("dueDate")}</p>}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="task-time">Time <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Input id="task-time" type="time" value={v.dueTime} disabled={!v.dueDate} onChange={(e) => set("dueTime", e.target.value)} aria-invalid={!!err("dueTime")} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="task-repeat">Repeat</Label>
          <NativeSelect
            id="task-repeat"
            value={preset}
            onChange={(e) => {
              const p = e.target.value as RepeatPreset | "custom";
              if (p === "custom") return;
              set("recurrenceRule", ruleFromPreset(p, v.dueDate || localDateKey(new Date(), tz)) ?? "");
            }}
            aria-invalid={!!err("recurrenceRule")}
          >
            {REPEATS.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
            {preset === "custom" && <option value="custom">{ruleText ?? "Custom"}</option>}
          </NativeSelect>
        </div>
      </div>
      {ruleText && (
        <p className="-mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Repeat className="size-3" aria-hidden /> {ruleText}. Completing one creates the next, in {tz.replace(/_/g, " ")} time.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="task-priority">Priority</Label>
          <NativeSelect id="task-priority" value={Number(v.priority ?? 3)} onChange={(e) => set("priority", Number(e.target.value) as Priority)}>
            {([1, 2, 3, 4] as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="task-area">Area</Label>
          <NativeSelect id="task-area" value={v.area} onChange={(e) => set("area", e.target.value as TaskInput["area"])}>
            {AREAS.map((a) => <option key={a} value={a} className="capitalize">{a[0].toUpperCase() + a.slice(1)}</option>)}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="task-status">Status</Label>
          <NativeSelect id="task-status" value={v.status} onChange={(e) => set("status", e.target.value as TaskInput["status"])}>
            <option value="todo">To do</option>
            <option value="in_progress">Doing</option>
            <option value="waiting">Blocked</option>
          </NativeSelect>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="task-project">Project</Label>
          <NativeSelect id="task-project" value={v.projectId} onChange={(e) => set("projectId", e.target.value)}>
            <option value="">None</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </NativeSelect>
        </div>
        {goals.length > 0 && (
          <div className="grid gap-1.5 sm:order-last sm:col-span-3">
            <Label htmlFor="task-goal">Goal <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <NativeSelect id="task-goal" value={v.goalId ?? ""} onChange={(e) => set("goalId", e.target.value)}>
              <option value="">None</option>
              {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
            </NativeSelect>
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="task-estimate">Estimate (min)</Label>
          <Input id="task-estimate" type="number" min={1} max={10080} inputMode="numeric" value={(v.estimateMinutes as number | undefined) ?? ""} onChange={(e) => set("estimateMinutes", e.target.value ? Number(e.target.value) : undefined)} />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="task-tags">Tags</Label>
        <Input id="task-tags" value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="client, errands" />
        <p className="text-[11px] text-muted-foreground">Separate with commas. New tags are created automatically.</p>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="task-notes">Notes</Label>
        <Textarea id="task-notes" value={v.notes} maxLength={10000} onChange={(e) => set("notes", e.target.value)} className="min-h-16" />
      </div>

      <label className={cn("flex cursor-pointer items-center gap-3 rounded-2xl border border-border px-3 py-2.5", v.isTopPriority && "border-brand/50 bg-accent/50")}>
        <Star className={cn("size-4 text-muted-foreground", v.isTopPriority && "fill-brand text-brand")} aria-hidden />
        <span className="flex-1 text-[13px]">
          Today&apos;s focus
          <span className="block text-[11px] text-muted-foreground">Pins it to Today and the Command Center. Keep it to about three.</span>
        </span>
        <Switch checked={v.isTopPriority} onCheckedChange={(c) => set("isTopPriority", c)} aria-label="Today's focus" />
      </label>

      {!task && (
        <div className={cn("grid gap-2 rounded-2xl border border-border px-3 py-2.5", rem.on && "border-brand/50 bg-accent/50")}>
          <label className="flex cursor-pointer items-center gap-3">
            <BellRing className={cn("size-4 text-muted-foreground", rem.on && "text-brand")} aria-hidden />
            <span className="flex-1 text-[13px]">
              Remind me
              <span className="block text-[11px] text-muted-foreground">A due date alone doesn&apos;t send anything; a reminder does.</span>
            </span>
            <Switch checked={rem.on} onCheckedChange={toggleReminder} aria-label="Remind me" />
          </label>
          {rem.on && (
            <>
              <div className="flex flex-wrap gap-2">
                <Input type="date" className="w-auto" value={rem.date} min={today} max={addDays(today, 730)} onChange={(e) => setRem((r) => ({ ...r, date: e.target.value }))} aria-label="Reminder date" />
                <Input type="time" className="w-auto" value={rem.time} onChange={(e) => setRem((r) => ({ ...r, time: e.target.value }))} aria-label="Reminder time" />
              </div>
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={rem.devices} onChange={(e) => setRem((r) => ({ ...r, devices: e.target.checked }))} className="size-4 accent-[var(--brand)]" />
                Also notify my devices
              </label>
              {err("reminder") && <p className="text-xs text-destructive">{err("reminder")}</p>}
            </>
          )}
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : task ? "Save changes" : "Add task"}</Button>
      </div>
    </form>
  );
}
