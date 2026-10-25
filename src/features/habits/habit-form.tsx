"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { createHabit, updateHabit, type HabitInput } from "@/server/actions/habits";
import { useServerAction } from "@/features/dashboard/use-server-action";
import { DAY_SHORT, TIME_OF_DAY_LABEL, type HabitRecord } from "./types";

type Errors = Record<string, string[] | undefined>;
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function HabitForm({ habit, goals = [], onDone, onCancel }: { habit: HabitRecord | null; goals?: { id: string; title: string }[]; onDone: () => void; onCancel: () => void }) {
  const [v, setV] = useState<HabitInput>(() =>
    habit
      ? {
          name: habit.name,
          description: habit.description ?? "",
          cadence: habit.cadence,
          scheduleDays: habit.schedule_days,
          targetPerPeriod: habit.target_per_period,
          timeOfDay: habit.time_of_day ?? "anytime",
          goalId: habit.goal_id ?? "",
          scheduledTime: habit.scheduled_time?.slice(0, 5) ?? "",
          remind: !!habit.reminder,
          notifyDevices: habit.reminder ? habit.reminder.channels.includes("web_push") : true,
        }
      : { name: "", description: "", cadence: "daily", scheduleDays: [0, 1, 2, 3, 4, 5, 6], targetPerPeriod: 1, timeOfDay: "anytime", goalId: "", scheduledTime: "", remind: false, notifyDevices: true },
  );
  const [errors, setErrors] = useState<Errors>({});
  const { pending, run } = useServerAction();
  const set = <K extends keyof HabitInput>(k: K, val: HabitInput[K]) => setV((s) => ({ ...s, [k]: val }));
  const err = (k: string) => errors[k]?.[0];
  const days = v.scheduleDays ?? [];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    run(
      async () => {
        const r = habit ? await updateHabit(habit.id, v) : await createHabit(v);
        if (!r.ok && r.fieldErrors) setErrors(r.fieldErrors);
        return r;
      },
      { onSuccess: onDone },
    );
  };

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <div className="grid gap-1.5">
        <Label htmlFor="habit-name">Habit</Label>
        <Input id="habit-name" autoFocus value={v.name} maxLength={120} onChange={(e) => set("name", e.target.value)} aria-invalid={!!err("name")} placeholder="e.g. Read 20 pages" />
        {err("name") && <p className="text-xs text-destructive">{err("name")}</p>}
      </div>

      <div className="grid gap-1.5">
        <span className="text-[13px] font-medium">How often</span>
        <div role="radiogroup" aria-label="How often" className="flex rounded-full bg-tint-mist p-1">
          {(["daily", "weekly"] as const).map((c) => (
            <button
              type="button"
              key={c}
              role="radio"
              aria-checked={v.cadence === c}
              onClick={() => set("cadence", c)}
              className={cn("h-9 flex-1 cursor-pointer rounded-full text-[13px] text-muted-foreground", v.cadence === c && "bg-card font-medium text-foreground shadow-clay")}
            >
              {c === "daily" ? "On set days" : "Times per week"}
            </button>
          ))}
        </div>
      </div>

      {v.cadence === "daily" ? (
        <div className="grid gap-1.5">
          <span className="text-[13px] font-medium" id="habit-days">Days</span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="habit-days">
            {WEEK_ORDER.map((d) => {
              const on = days.includes(d);
              return (
                <button
                  type="button"
                  key={d}
                  aria-pressed={on}
                  onClick={() => set("scheduleDays", on ? days.filter((x) => x !== d) : [...days, d])}
                  className={cn("h-8 w-11 cursor-pointer rounded-md border text-[12px]", on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted")}
                >
                  {DAY_SHORT[d]}
                </button>
              );
            })}
          </div>
          {err("scheduleDays") && <p className="text-xs text-destructive">{err("scheduleDays")}</p>}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="habit-target">{v.cadence === "daily" ? "Times per day" : "Times per week"}</Label>
          <Input
            id="habit-target"
            type="number"
            min={1}
            max={50}
            inputMode="numeric"
            value={String(v.targetPerPeriod ?? "")}
            onChange={(e) => set("targetPerPeriod", e.target.value === "" ? ("" as unknown as number) : Number(e.target.value))}
            aria-invalid={!!err("targetPerPeriod")}
          />
          {err("targetPerPeriod") && <p className="text-xs text-destructive">{err("targetPerPeriod")}</p>}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="habit-time">Time of day</Label>
          <NativeSelect id="habit-time" value={v.timeOfDay} onChange={(e) => set("timeOfDay", e.target.value as HabitInput["timeOfDay"])}>
            {Object.entries(TIME_OF_DAY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </NativeSelect>
        </div>
      </div>

      <div className="grid gap-3 rounded-2xl border border-border p-3">
        <div className="grid gap-1.5 sm:max-w-48">
          <Label htmlFor="habit-at">At <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Input id="habit-at" type="time" value={v.scheduledTime ?? ""} onChange={(e) => set("scheduledTime", e.target.value)} aria-invalid={!!err("scheduledTime")} />
          {err("scheduledTime") && <p className="text-xs text-destructive">{err("scheduledTime")}</p>}
        </div>
        <label className="flex items-center justify-between gap-3 text-[13px]">
          <span>
            Remind me at this time
            <span className="block text-[11px] text-muted-foreground">
              {v.cadence === "daily" ? "On the days above." : "Every day until the week's target is met."} Skipped once you&apos;ve logged it.
            </span>
          </span>
          <Switch checked={!!v.remind} onCheckedChange={(c) => set("remind", c)} aria-label="Remind me at this time" />
        </label>
        {v.remind && (
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={v.notifyDevices ?? true} onChange={(e) => set("notifyDevices", e.target.checked)} className="size-4 accent-[var(--brand)]" />
            Also notify my devices
          </label>
        )}
      </div>

      {goals.length > 0 && (
        <div className="grid gap-1.5">
          <Label htmlFor="habit-goal">Goal <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <NativeSelect id="habit-goal" value={v.goalId ?? ""} onChange={(e) => set("goalId", e.target.value)}>
            <option value="">None</option>
            {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </NativeSelect>
        </div>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="habit-notes">Why it matters <span className="font-normal text-muted-foreground">(optional)</span></Label>
        <Textarea id="habit-notes" value={v.description} maxLength={2000} onChange={(e) => set("description", e.target.value)} className="min-h-16" />
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : habit ? "Save changes" : "Add habit"}</Button>
      </div>
    </form>
  );
}
