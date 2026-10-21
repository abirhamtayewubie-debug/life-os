"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { createHabit, updateHabit, type HabitInput } from "@/server/actions/habits";
import { useServerAction } from "@/features/dashboard/use-server-action";
import { DAY_SHORT, TIME_OF_DAY_LABEL, type HabitRecord } from "./types";

type Errors = Record<string, string[] | undefined>;
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function HabitForm({ habit, onDone, onCancel }: { habit: HabitRecord | null; onDone: () => void; onCancel: () => void }) {
  const [v, setV] = useState<HabitInput>(() =>
    habit
      ? {
          name: habit.name,
          description: habit.description ?? "",
          cadence: habit.cadence,
          scheduleDays: habit.schedule_days,
          targetPerPeriod: habit.target_per_period,
          timeOfDay: habit.time_of_day ?? "anytime",
        }
      : { name: "", description: "", cadence: "daily", scheduleDays: [0, 1, 2, 3, 4, 5, 6], targetPerPeriod: 1, timeOfDay: "anytime" },
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
        <div role="radiogroup" aria-label="How often" className="flex rounded-md bg-muted p-0.5">
          {(["daily", "weekly"] as const).map((c) => (
            <button
              type="button"
              key={c}
              role="radio"
              aria-checked={v.cadence === c}
              onClick={() => set("cadence", c)}
              className={cn("h-7 flex-1 cursor-pointer rounded text-[13px] text-muted-foreground", v.cadence === c && "bg-surface font-medium text-foreground shadow-card")}
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
