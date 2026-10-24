"use client";

import { Plus, X } from "lucide-react";
import { FormActions, useActionForm } from "@/components/data/action-form";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { saveCheckin, saveMeasurements, saveSleep, saveWorkout, type CheckinInput, type WorkoutInput } from "@/server/actions/health";
import { clock, localMinutes, METRIC_UNITS, preferredUnit, rangeFor, type BodyMetric } from "./metrics";
import { METRIC_LABEL, SCALE_LABEL, type HealthWorkspace, type SleepLog, type WellnessLog, type Workout } from "./types";

/** A 1–5 choice as a row of buttons; picking the selected value again clears it. */
export function Scale({ id, label, value, onChange, labels }: { id: string; label: string; value: number | null; onChange: (v: number | null) => void; labels: readonly string[] }) {
  return (
    <div className="grid gap-1.5">
      <span id={id} className="text-[13px] font-medium">{label}{value ? <span className="font-normal text-muted-foreground"> · {labels[value - 1]}</span> : null}</span>
      <div role="radiogroup" aria-labelledby={id} className="grid grid-cols-5 gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n}: ${labels[n - 1]}`} onClick={() => onChange(value === n ? null : n)}
            className={cn("h-9 cursor-pointer rounded-xl border border-border text-[13px] tabular hover:bg-muted", value === n && "border-transparent bg-brand text-brand-foreground hover:bg-brand")}>
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

export function CheckinForm({ ws, log, onDone, onCancel }: { ws: HealthWorkspace; log: WellnessLog | null; onDone: () => void; onCancel: () => void }) {
  const { v, set, err, pending, submit } = useActionForm<{ date: string; mood: number | null; energy: number | null; stress: number | null; note: string }>(() => ({
    date: log?.log_date ?? ws.today, mood: log?.mood ?? null, energy: log?.energy ?? null, stress: log?.stress ?? null, note: log?.note ?? "",
  }));
  return (
    <form noValidate className="grid gap-4" onSubmit={submit((x) => saveCheckin(log?.id ?? null, x as CheckinInput), onDone)}>
      <Scale id="ci-mood" label="Mood" value={v.mood} onChange={(n) => set("mood", n)} labels={SCALE_LABEL.mood} />
      <Scale id="ci-energy" label="Energy" value={v.energy} onChange={(n) => set("energy", n)} labels={SCALE_LABEL.energy} />
      <Scale id="ci-stress" label="Stress" value={v.stress} onChange={(n) => set("stress", n)} labels={SCALE_LABEL.stress} />
      {err("mood") && <p className="text-xs text-destructive">{err("mood")}</p>}
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <Field id="ci-date" label="Day" error={err("date")}>
          <Input id="ci-date" type="date" max={ws.today} value={v.date} onChange={(e) => set("date", e.target.value)} />
        </Field>
        <Field id="ci-note" label="Note" optional>
          <Textarea id="ci-note" value={v.note} maxLength={2000} className="min-h-9" placeholder="What's behind it, if you want to remember" onChange={(e) => set("note", e.target.value)} />
        </Field>
      </div>
      <FormActions pending={pending} label={log ? "Save changes" : "Save check-in"} onCancel={onCancel} />
    </form>
  );
}

/* ------------------------------------------------------------------------ */

export type SetRow = { exercise: string; reps: string; weight: string; unit: "kg" | "lb"; seconds: string; km: string };
/** A workout started from a program day: pre-filled, and remembered as coming from it. */
export type WorkoutStart = { programId: string; day: string; activity: string; goalId: string | null; sets: SetRow[] };
const PRESETS = ["Run", "Walk", "Strength", "Cycling", "Swimming", "Football", "Yoga", "Stretching"];

export function WorkoutForm({ ws, workout, start, onDone, onCancel }: { ws: HealthWorkspace; workout: Workout | null; start?: WorkoutStart; onDone: () => void; onCancel: () => void }) {
  const unit = ws.system === "imperial" ? "lb" : "kg";
  const { v, set, err, pending, submit } = useActionForm(() => ({
    date: workout?.performed_on ?? ws.today,
    time: workout?.started_at ? clock(localMinutes(workout.started_at, ws.timezone)) : "",
    activity: workout?.activity ?? start?.activity ?? "",
    duration: workout?.duration_minutes?.toString() ?? "",
    effort: workout?.perceived_effort?.toString() ?? "",
    notes: workout?.notes ?? "",
    goalId: workout?.goal_id ?? start?.goalId ?? "",
    programId: workout?.program_id ?? start?.programId ?? "",
    programDay: workout?.program_day ?? start?.day ?? "",
    sets: start && !workout ? start.sets : (workout?.sets ?? []).map((s): SetRow => ({
      exercise: s.exercise, reps: s.reps?.toString() ?? "", weight: s.weight ? String(Number(s.weight)) : "", unit: s.weight_unit ?? unit,
      seconds: s.duration_seconds?.toString() ?? "", km: s.distance_m ? String(Number(s.distance_m) / 1000) : "",
    })),
  }));
  const setRow = (i: number, patch: Partial<SetRow>) => set("sets", v.sets.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const addRow = () => {
    const last = v.sets.at(-1);
    set("sets", [...v.sets, last ? { ...last } : { exercise: "", reps: "", weight: "", unit, seconds: "", km: "" }]);
  };
  return (
    <form noValidate className="grid gap-4" onSubmit={submit((x) => saveWorkout(workout?.id ?? null, x as WorkoutInput), onDone)}>
      <div className="grid gap-4 sm:grid-cols-[1fr_9.5rem_7rem]">
        <Field id="wo-activity" label="Activity" error={err("activity")}>
          <Input id="wo-activity" autoFocus list="wo-presets" value={v.activity} maxLength={80} placeholder="Run, strength, football…" onChange={(e) => set("activity", e.target.value)} aria-invalid={!!err("activity")} />
          <datalist id="wo-presets">{PRESETS.map((p) => <option key={p} value={p} />)}</datalist>
        </Field>
        <Field id="wo-date" label="Date" error={err("date")}>
          <Input id="wo-date" type="date" max={ws.today} value={v.date} onChange={(e) => set("date", e.target.value)} />
        </Field>
        <Field id="wo-time" label="Start" optional>
          <Input id="wo-time" type="time" value={v.time} onChange={(e) => set("time", e.target.value)} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="wo-duration" label="Minutes" optional error={err("duration")}>
          <Input id="wo-duration" inputMode="numeric" value={v.duration} onChange={(e) => set("duration", e.target.value)} aria-invalid={!!err("duration")} />
        </Field>
        <Field id="wo-effort" label="Effort (1–10)" optional error={err("effort")} hint="How hard it felt to you.">
          <Input id="wo-effort" inputMode="numeric" value={v.effort} onChange={(e) => set("effort", e.target.value)} aria-invalid={!!err("effort")} />
        </Field>
        {ws.goals.length > 0 && (
          <Field id="wo-goal" label="Goal" optional>
            <NativeSelect id="wo-goal" value={v.goalId} onChange={(e) => set("goalId", e.target.value)}>
              <option value="">None</option>
              {ws.goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
            </NativeSelect>
          </Field>
        )}
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-[13px] font-medium">Sets <span className="font-normal text-muted-foreground">(optional)</span></legend>
        {v.sets.length > 0 && (
          <div className="grid gap-2">
            {v.sets.map((s, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_4rem_5rem_4rem_auto] items-center gap-1.5 max-sm:grid-cols-[minmax(0,1fr)_4rem_5rem_auto]">
                <Input aria-label={`Set ${i + 1} exercise`} placeholder="Exercise" value={s.exercise} maxLength={80} onChange={(e) => setRow(i, { exercise: e.target.value })} className="h-8" />
                <Input aria-label={`Set ${i + 1} reps`} placeholder="Reps" inputMode="numeric" value={s.reps} onChange={(e) => setRow(i, { reps: e.target.value })} className="h-8" />
                <Input aria-label={`Set ${i + 1} weight (${s.unit})`} placeholder={s.unit} inputMode="decimal" value={s.weight} onChange={(e) => setRow(i, { weight: e.target.value })} className="h-8" />
                <Input aria-label={`Set ${i + 1} distance (km)`} placeholder="km" inputMode="decimal" value={s.km} onChange={(e) => setRow(i, { km: e.target.value })} className="h-8 max-sm:hidden" />
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove set ${i + 1}`} onClick={() => set("sets", v.sets.filter((_, j) => j !== i))}><X /></Button>
              </div>
            ))}
          </div>
        )}
        {err("sets") && <p className="text-xs text-destructive">{err("sets")}</p>}
        <Button type="button" size="sm" variant="outline" className="w-fit" onClick={addRow}><Plus /> {v.sets.length ? "Another set" : "Add sets"}</Button>
      </fieldset>

      <Field id="wo-notes" label="Notes" optional>
        <Textarea id="wo-notes" value={v.notes} maxLength={2000} className="min-h-14" onChange={(e) => set("notes", e.target.value)} />
      </Field>
      <FormActions pending={pending} label={workout ? "Save changes" : "Save workout"} onCancel={onCancel} />
    </form>
  );
}

/* ------------------------------------------------------------------------ */

const METRICS: BodyMetric[] = ["weight", "waist", "hip", "chest", "body_fat_pct", "resting_hr"];

export function MeasurementForm({ ws, initial, onDone, onCancel }: { ws: HealthWorkspace; initial?: BodyMetric | "blood_pressure"; onDone: () => void; onCancel: () => void }) {
  const { v, set, err, pending, submit } = useActionForm(() => {
    const metric = initial ?? "weight";
    return { metric, value: "", unit: metric === "blood_pressure" ? "mmHg" : preferredUnit(metric, ws.system), sys: "", dia: "", date: ws.today, time: "" };
  });
  const bp = v.metric === "blood_pressure";
  const units = bp ? ["mmHg"] : METRIC_UNITS[v.metric as BodyMetric];
  const range = bp ? null : rangeFor(v.metric as BodyMetric, v.unit);
  const toInput = () => ({
    date: v.date, time: v.time,
    entries: bp ? [{ metric: "blood_pressure_sys" as const, value: v.sys, unit: "mmHg" }, { metric: "blood_pressure_dia" as const, value: v.dia, unit: "mmHg" }] : [{ metric: v.metric as BodyMetric, value: v.value, unit: v.unit }],
  });
  return (
    <form noValidate className="grid gap-4" onSubmit={submit(() => saveMeasurements(toInput()), onDone)}>
      <Field id="me-metric" label="What">
        <NativeSelect id="me-metric" value={v.metric} onChange={(e) => { const m = e.target.value as BodyMetric | "blood_pressure"; set("metric", m); set("unit", m === "blood_pressure" ? "mmHg" : preferredUnit(m, ws.system)); }}>
          {METRICS.map((m) => <option key={m} value={m}>{METRIC_LABEL[m]}</option>)}
          <option value="blood_pressure">Blood pressure</option>
        </NativeSelect>
      </Field>
      {bp ? (
        <div className="grid grid-cols-2 gap-4">
          <Field id="me-sys" label="Upper number (mmHg)" error={err("blood_pressure_sys")}>
            <Input id="me-sys" autoFocus inputMode="numeric" value={v.sys} onChange={(e) => set("sys", e.target.value)} aria-invalid={!!err("blood_pressure_sys")} />
          </Field>
          <Field id="me-dia" label="Lower number (mmHg)" error={err("blood_pressure_dia")}>
            <Input id="me-dia" inputMode="numeric" value={v.dia} onChange={(e) => set("dia", e.target.value)} aria-invalid={!!err("blood_pressure_dia")} />
          </Field>
        </div>
      ) : (
        <div className="grid grid-cols-[1fr_7rem] gap-4">
          <Field id="me-value" label="Value" error={err(v.metric) ?? err("entries")} hint={range ? `${range[0]} to ${range[1]} ${v.unit}` : undefined}>
            <Input id="me-value" autoFocus inputMode="decimal" value={v.value} onChange={(e) => set("value", e.target.value)} aria-invalid={!!(err(v.metric) ?? err("entries"))} />
          </Field>
          <Field id="me-unit" label="Unit" error={err("unit")}>
            <NativeSelect id="me-unit" value={v.unit} onChange={(e) => set("unit", e.target.value)} disabled={units.length === 1}>
              {units.map((u) => <option key={u} value={u}>{u}</option>)}
            </NativeSelect>
          </Field>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <Field id="me-date" label="Date" error={err("date")}>
          <Input id="me-date" type="date" max={ws.today} value={v.date} onChange={(e) => set("date", e.target.value)} />
        </Field>
        <Field id="me-time" label="Time" optional hint="Morning readings are easiest to compare.">
          <Input id="me-time" type="time" value={v.time} onChange={(e) => set("time", e.target.value)} />
        </Field>
      </div>
      <p className="text-[12px] text-muted-foreground">This is a log of what you measured. Life OS doesn&apos;t judge readings; ask a clinician about anything that worries you.</p>
      <FormActions pending={pending} label="Save" onCancel={onCancel} />
    </form>
  );
}

/* ------------------------------------------------------------------------ */

export function SleepForm({ ws, night, onDone, onCancel }: { ws: HealthWorkspace; night: SleepLog | null; onDone: () => void; onCancel: () => void }) {
  const { v, set, err, pending, submit } = useActionForm(() => ({
    wakeDate: night?.sleep_date ?? ws.today,
    bed: night ? clock(localMinutes(night.bedtime, ws.timezone)) : "23:00",
    wake: night ? clock(localMinutes(night.wake_time, ws.timezone)) : "06:30",
    quality: night?.quality ?? null as number | null,
    awakenings: night?.awakenings?.toString() ?? "",
    notes: night?.notes ?? "",
  }));
  const [bh, bm] = v.bed.split(":").map(Number);
  const [wh, wm] = v.wake.split(":").map(Number);
  const mins = Number.isFinite(bh + bm + wh + wm) ? ((wh * 60 + wm) - (bh * 60 + bm) + 1440) % 1440 : null;
  return (
    <form noValidate className="grid gap-4" onSubmit={submit((x) => saveSleep(night?.id ?? null, x), onDone)}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="sl-date" label="Woke up on" error={err("wakeDate")}>
          <Input id="sl-date" type="date" max={ws.today} value={v.wakeDate} onChange={(e) => set("wakeDate", e.target.value)} aria-invalid={!!err("wakeDate")} />
        </Field>
        <Field id="sl-bed" label="Went to sleep" error={err("bed")}>
          <Input id="sl-bed" type="time" value={v.bed} onChange={(e) => set("bed", e.target.value)} aria-invalid={!!err("bed")} />
        </Field>
        <Field id="sl-wake" label="Woke up" error={err("wake")}>
          <Input id="sl-wake" type="time" value={v.wake} onChange={(e) => set("wake", e.target.value)} aria-invalid={!!err("wake")} />
        </Field>
      </div>
      {mins !== null && mins > 0 && <p className="-mt-2 text-[12px] text-muted-foreground">That&apos;s {Math.floor(mins / 60)}h {String(mins % 60).padStart(2, "0")}m{v.bed >= v.wake ? ", starting the evening before" : ""}.</p>}
      <Scale id="sl-quality" label="How rested do you feel?" value={v.quality} onChange={(n) => set("quality", n)} labels={["Exhausted", "Tired", "Okay", "Rested", "Very rested"]} />
      <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
        <Field id="sl-awake" label="Times woken" optional error={err("awakenings")}>
          <Input id="sl-awake" inputMode="numeric" value={v.awakenings} onChange={(e) => set("awakenings", e.target.value)} aria-invalid={!!err("awakenings")} />
        </Field>
        <Field id="sl-notes" label="Notes" optional>
          <Input id="sl-notes" value={v.notes} maxLength={2000} placeholder="Late coffee, noise, a good wind-down…" onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </div>
      <FormActions pending={pending} label={night ? "Save changes" : "Log night"} onCancel={onCancel} />
    </form>
  );
}
