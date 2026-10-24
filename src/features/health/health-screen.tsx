"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Activity, Droplets, HeartPulse, Pencil, Plus, Ruler, Smile } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ConfirmDelete } from "@/components/data/confirm-delete";
import { EmptyState } from "@/components/data/empty-state";
import { ProvenanceBadge } from "@/components/data/provenance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { addDays, formatShortDate, formatTime, relativeDay } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { addWater, deleteCheckin, deleteMeasurements, deleteWater, deleteWorkout } from "@/server/actions/health";
import { useServerAction } from "@/features/dashboard/use-server-action";
import { weekStart } from "@/features/work/stats";
import { CheckinForm, MeasurementForm, WorkoutForm } from "./forms";
import { SleepScreen } from "./sleep-screen";
import { averageOf, formatMinutes, hydrationByDay, metricSeries, preferredUnit, volumeByExercise, wellnessByDay, workoutSummary, type BodyMetric } from "./metrics";
import { METRIC_LABEL, SCALE_LABEL, type HealthWorkspace, type MeasurementRow, type WellnessLog, type Workout } from "./types";

export type HealthTab = "today" | "workouts" | "sleep" | "body" | "trends";
const TABS: { v: HealthTab; label: string }[] = [
  { v: "today", label: "Today" },
  { v: "workouts", label: "Workouts" },
  { v: "sleep", label: "Sleep & recovery" },
  { v: "body", label: "Body" },
  { v: "trends", label: "Mood & energy" },
];

type Editor = { k: "checkin"; x: WellnessLog | null } | { k: "workout"; x: Workout | null } | { k: "measure"; metric?: BodyMetric | "blood_pressure" };

export const tooltipStyle = { background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 };
export const axisTick = { fill: "var(--color-muted-foreground)", fontSize: 10 };

export function HealthScreen({ ws, tab, startNew = false }: { ws: HealthWorkspace; tab: HealthTab; startNew?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [editor, setEditor] = useState<Editor | null>(startNew && tab !== "sleep" ? { k: tab === "workouts" ? "workout" : tab === "body" ? "measure" : "checkin", x: null } as Editor : null);
  const close = () => setEditor(null);

  useEffect(() => {
    const onCheckin = () => setEditor({ k: "checkin", x: null });
    const onWorkout = () => setEditor({ k: "workout", x: null });
    window.addEventListener("lifeos:new-checkin", onCheckin);
    window.addEventListener("lifeos:new-workout", onWorkout);
    return () => { window.removeEventListener("lifeos:new-checkin", onCheckin); window.removeEventListener("lifeos:new-workout", onWorkout); };
  }, []);

  const title = editor?.k === "checkin" ? (editor.x ? "Edit check-in" : "How are you?") : editor?.k === "workout" ? (editor.x ? "Edit workout" : "Log a workout") : "Add a measurement";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="-mx-1 overflow-x-auto px-1">
          <div role="tablist" aria-label="Health views" className="flex w-max rounded-md bg-muted p-0.5">
            {TABS.map((t) => (
              <button key={t.v} role="tab" aria-selected={tab === t.v} onClick={() => router.replace(t.v === "today" ? pathname : `${pathname}?tab=${t.v}`, { scroll: false })}
                className={cn("h-7 cursor-pointer rounded px-3 text-[13px] whitespace-nowrap text-muted-foreground", tab === t.v && "bg-surface font-medium text-foreground shadow-card")}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className={cn("ml-auto flex gap-2", tab === "sleep" && "hidden")}>
          {tab === "workouts" ? <Button size="sm" onClick={() => setEditor({ k: "workout", x: null })}><Plus /> Workout</Button>
            : tab === "body" ? <Button size="sm" onClick={() => setEditor({ k: "measure" })}><Plus /> Measurement</Button>
            : <Button size="sm" onClick={() => setEditor({ k: "checkin", x: null })}><Plus /> Check-in</Button>}
        </div>
      </div>

      {tab === "today" ? <TodayTab ws={ws} onEdit={setEditor} />
        : tab === "workouts" ? <WorkoutsTab ws={ws} onEdit={setEditor} />
        : tab === "sleep" ? <SleepScreen ws={ws} startNew={startNew} />
        : tab === "body" ? <BodyTab ws={ws} onEdit={setEditor} />
        : <TrendsTab ws={ws} />}

      <p className="text-[11px] text-muted-foreground">Health entries are private to you. They&apos;re summaries of what you logged, not medical advice, and nothing here diagnoses anything.</p>

      <Dialog open={!!editor} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="sr-only">{title}</DialogDescription>
          </DialogHeader>
          {editor?.k === "checkin" && <CheckinForm ws={ws} log={editor.x} onDone={close} onCancel={close} />}
          {editor?.k === "workout" && <WorkoutForm ws={ws} workout={editor.x} onDone={close} onCancel={close} />}
          {editor?.k === "measure" && <MeasurementForm ws={ws} initial={editor.metric} onDone={close} onCancel={close} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="grid content-start gap-0.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="tabular font-display text-xl font-semibold tracking-[-0.025em]">{value}</span>
      {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

function TodayTab({ ws, onEdit }: { ws: HealthWorkspace; onEdit: (e: Editor) => void }) {
  const { run, pending } = useServerAction();
  const [ml, setMl] = useState("");
  const todays = ws.wellness.filter((w) => w.log_date === ws.today).sort((a, b) => b.logged_at.localeCompare(a.logged_at));
  const water = ws.hydration.filter((h) => h.log_date === ws.today);
  const waterTotal = water.reduce((a, h) => a + h.amount_ml, 0);
  const weekFrom = addDays(ws.today, -6);
  const week = wellnessByDay(ws.wellness, weekFrom, ws.today);
  const wk = workoutSummary(ws.workouts, weekFrom, ws.today);
  const waterWeek = hydrationByDay(ws.hydration, weekFrom, ws.today).filter((d) => d.ml > 0);
  const lastNight = ws.sleep.find((s) => s.sleep_date === ws.today);
  const add = (n: number) => run(() => addWater({ date: ws.today, ml: n }));

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="grid min-w-0 content-start gap-5">
        <Card className="grid gap-3 p-5">
          <div className="flex items-center gap-2">
            <Smile className="size-4 text-muted-foreground" aria-hidden />
            <h2 className="text-[13px] font-medium">Today&apos;s check-ins</h2>
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => onEdit({ k: "checkin", x: null })}><Plus /> Check in</Button>
          </div>
          {todays.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No check-in yet today. It takes ten seconds: mood, energy and stress, 1 to 5.</p>
          ) : (
            <ul className="divide-y divide-border">
              {todays.map((w) => (
                <li key={w.id} className="group flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-[13px]">
                  <span className="w-12 text-[12px] text-muted-foreground">{formatTime(w.logged_at, ws.timezone, ws.locale)}</span>
                  {(["mood", "energy", "stress"] as const).map((k) => w[k] !== null && (
                    <span key={k}><span className="text-muted-foreground">{k[0].toUpperCase() + k.slice(1)}</span> <span className="tabular font-medium">{w[k]}</span><span className="text-muted-foreground">/5 · {SCALE_LABEL[k][w[k]! - 1]}</span></span>
                  ))}
                  <ProvenanceBadge source={w.source} />
                  {w.note && <span className="basis-full truncate pl-16 text-[12px] text-muted-foreground">{w.note}</span>}
                  <span className="ml-auto flex items-center gap-0.5 pointer-fine:opacity-0 pointer-fine:group-focus-within:opacity-100 pointer-fine:group-hover:opacity-100">
                    <Button size="icon-sm" variant="ghost" className="size-6 text-muted-foreground" aria-label="Edit check-in" onClick={() => onEdit({ k: "checkin", x: w })}><Pencil /></Button>
                    <ConfirmDelete size="icon-sm" label="Delete check-in" disabled={pending} title="Delete this check-in?" description="It's removed from your trends and reports." onConfirm={() => run(() => deleteCheckin(w.id))} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="grid gap-3 p-5">
          <div className="flex items-center gap-2">
            <Droplets className="size-4 text-muted-foreground" aria-hidden />
            <h2 className="text-[13px] font-medium">Water today</h2>
            <span className="ml-auto tabular text-[15px] font-semibold">{(waterTotal / 1000).toFixed(2).replace(/0$/, "")} L</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {[250, 500].map((n) => <Button key={n} size="sm" variant="outline" disabled={pending} onClick={() => add(n)}>+{n} ml</Button>)}
            <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); if (ml) { add(Number(ml)); setMl(""); } }}>
              <Input aria-label="Other amount in ml" inputMode="numeric" placeholder="ml" value={ml} onChange={(e) => setMl(e.target.value.replace(/\D/g, ""))} className="h-8 w-20" />
              <Button type="submit" size="sm" variant="ghost" disabled={!ml || pending}>Add</Button>
            </form>
          </div>
          {water.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {water.map((h) => (
                <li key={h.id} className="flex items-center gap-1 rounded-full border border-border py-0.5 pr-1 pl-2.5 text-[12px] tabular">
                  {h.amount_ml} ml
                  <ConfirmDelete size="icon-sm" label={`Remove ${h.amount_ml} ml`} disabled={pending} title="Remove this entry?" description={`${h.amount_ml} ml is taken off today's total.`} confirmLabel="Remove" onConfirm={() => run(() => deleteWater(h.id))} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="grid content-start gap-4 p-5">
        <h2 className="text-[13px] font-medium">Last 7 days</h2>
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Mood" value={averageOf(week, "mood") ?? "–"} sub={`${week.filter((d) => d.checkins).length} days checked in`} />
          <Stat label="Energy" value={averageOf(week, "energy") ?? "–"} sub="average, 1–5" />
          <Stat label="Workouts" value={wk.sessions} sub={wk.minutes ? `${formatMinutes(wk.minutes)} in total` : "no timed sessions"} />
          <Stat label="Water" value={waterWeek.length ? `${(waterWeek.reduce((a, d) => a + d.ml, 0) / waterWeek.length / 1000).toFixed(1)} L` : "–"} sub={waterWeek.length ? `average on ${waterWeek.length} logged days` : "nothing logged"} />
        </div>
        <div className="rounded-xl border border-border p-3 text-[12px] text-muted-foreground">
          {lastNight ? <>Last night: <span className="font-medium text-foreground">{formatMinutes(lastNight.duration_minutes)}</span>{lastNight.quality ? `, felt ${lastNight.quality}/5` : ""}. </> : "Last night isn't logged yet. "}
          <Link href="/health?tab=sleep" className="text-foreground underline underline-offset-2">Sleep</Link>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function WorkoutsTab({ ws, onEdit }: { ws: HealthWorkspace; onEdit: (e: Editor) => void }) {
  const { run, pending } = useServerAction();
  const mon = weekStart(ws.today);
  const thisWeek = workoutSummary(ws.workouts, mon, ws.today);
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(mon, -7 * (7 - i))).map((start) => {
    const s = workoutSummary(ws.workouts, start, addDays(start, 6));
    return { start, label: formatShortDate(start, ws.locale), minutes: s.minutes, sessions: s.sessions };
  });
  const unit = ws.system === "imperial" ? "lb" : "kg";

  if (!ws.workouts.length) {
    return (
      <Card>
        <EmptyState icon={Activity} title="No workouts logged" action={<Button size="sm" onClick={() => onEdit({ k: "workout", x: null })}><Plus /> Log a workout</Button>}>
          Any movement counts: a walk, a run, football, a strength session. Add sets if you want to track weights.
        </EmptyState>
      </Card>
    );
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Card className="grid content-start gap-4 p-5">
          <h2 className="text-[13px] font-medium">This week <span className="font-normal text-muted-foreground">(from {formatShortDate(mon, ws.locale)})</span></h2>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Sessions" value={thisWeek.sessions} />
            <Stat label="Active days" value={thisWeek.activeDays} />
            <Stat label="Time" value={thisWeek.minutes ? formatMinutes(thisWeek.minutes) : "–"} sub={thisWeek.untimed ? `+${thisWeek.untimed} untimed` : undefined} />
          </div>
          {thisWeek.byActivity.length > 0 && (
            <ul className="grid gap-1 text-[12px]">
              {thisWeek.byActivity.map((a) => <li key={a.activity} className="flex justify-between"><span>{a.activity}</span><span className="tabular text-muted-foreground">{a.sessions}× {a.minutes ? `· ${a.minutes} min` : ""}</span></li>)}
            </ul>
          )}
        </Card>
        <Card className="grid content-start gap-2 p-5">
          <h2 className="text-[13px] font-medium">Minutes per week</h2>
          <div className="h-40" role="img" aria-label={`Workout minutes per week: ${weeks.map((w) => `week of ${w.label} ${w.minutes} minutes`).join(", ")}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeks} margin={{ top: 4, right: 0, left: -24, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="2 4" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={axisTick} />
                <Tooltip cursor={{ fill: "var(--color-muted)" }} contentStyle={tooltipStyle} formatter={(v, _n, p) => [`${v} min · ${p.payload.sessions} sessions`, "Week"]} />
                <Bar dataKey="minutes" fill="var(--color-chart-1)" radius={[3, 3, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-muted-foreground">Only sessions with a duration count toward minutes.</p>
        </Card>
      </div>

      <Card className="divide-y divide-border">
        {ws.workouts.map((w) => {
          const vol = volumeByExercise(w.sets, unit);
          const goal = w.goal_id ? ws.goals.find((g) => g.id === w.goal_id) : null;
          return (
            <div key={w.id} className="group flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-3">
              <div className="grid min-w-0 flex-1 basis-56 gap-0.5">
                <span className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium">
                  {w.activity}
                  {w.perceived_effort && <Badge variant="outline">Effort {w.perceived_effort}/10</Badge>}
                  <ProvenanceBadge source={w.source} />
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {[relativeDay(w.performed_on, ws.today) === "today" ? "Today" : formatShortDate(w.performed_on, ws.locale), w.started_at ? formatTime(w.started_at, ws.timezone, ws.locale) : null, w.duration_minutes ? `${w.duration_minutes} min` : null, goal ? `Goal: ${goal.title}` : null].filter(Boolean).join(" · ")}
                </span>
                {vol.length > 0 && (
                  <span className="text-[12px] text-muted-foreground">
                    {vol.map((x) => `${x.exercise} ${x.sets}×${x.volume ? ` (${x.volume.toLocaleString(ws.locale)} ${unit} moved)` : ""}`).join(" · ")}
                  </span>
                )}
                {w.notes && <span className="text-[12px] text-muted-foreground">{w.notes}</span>}
              </div>
              <span className="flex items-center gap-0.5 pointer-fine:opacity-0 pointer-fine:group-focus-within:opacity-100 pointer-fine:group-hover:opacity-100">
                <Button size="icon-sm" variant="ghost" className="size-7 text-muted-foreground" aria-label={`Edit ${w.activity} on ${w.performed_on}`} onClick={() => onEdit({ k: "workout", x: w })}><Pencil /></Button>
                <ConfirmDelete size="icon-sm" label={`Delete ${w.activity} on ${w.performed_on}`} disabled={pending} title="Delete this workout?" description="The workout and its sets are deleted." onConfirm={() => run(() => deleteWorkout(w.id))} />
              </span>
            </div>
          );
        })}
      </Card>
      <p className="text-[11px] text-muted-foreground">Showing the last {Math.round((Date.parse(ws.today) - Date.parse(ws.since)) / 86_400_000) + 1} days.</p>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

const BODY_METRICS: BodyMetric[] = ["weight", "waist", "hip", "chest", "body_fat_pct", "resting_hr"];

function BodyTab({ ws, onEdit }: { ws: HealthWorkspace; onEdit: (e: Editor) => void }) {
  const { run, pending } = useServerAction();
  const present = BODY_METRICS.filter((m) => ws.measurements.some((r) => r.metric === m));
  const bp = pairBloodPressure(ws.measurements);

  if (!present.length && !bp.length) {
    return (
      <Card>
        <EmptyState icon={Ruler} title="No measurements yet" action={<Button size="sm" onClick={() => onEdit({ k: "measure" })}><Plus /> Add a measurement</Button>}>
          Weight, waist, resting heart rate or blood pressure, whenever you take them. Units follow your preference in Settings.
        </EmptyState>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {present.map((m) => {
        const unit = preferredUnit(m, ws.system);
        const s = metricSeries(ws.measurements, m, unit);
        const rows = ws.measurements.filter((r) => r.metric === m);
        return (
          <Card key={m} className="grid content-start gap-3 p-4">
            <div className="flex items-baseline gap-2">
              <h2 className="text-[13px] font-medium">{METRIC_LABEL[m]}</h2>
              <ProvenanceBadge source={rows[0].source} />
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => onEdit({ k: "measure", metric: m })}><Plus /> Add</Button>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="tabular font-display text-2xl font-semibold tracking-[-0.025em]">{s.latest}<span className="text-sm font-normal text-muted-foreground"> {unit}</span></span>
              {s.change !== null && <span className="text-[12px] text-muted-foreground">{s.change > 0 ? "+" : ""}{s.change} {unit} since {formatShortDate(s.points[0].at.slice(0, 10), ws.locale)}</span>}
            </div>
            {s.points.length >= 2 && (
              <div className="h-24" role="img" aria-label={`${METRIC_LABEL[m]} readings: ${s.points.map((p) => `${formatShortDate(p.at.slice(0, 10), ws.locale)} ${p.value} ${unit}`).join(", ")}`}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={s.points.map((p) => ({ ...p, label: formatShortDate(p.at.slice(0, 10), ws.locale) }))} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="2 4" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} interval="preserveStartEnd" />
                    <YAxis domain={["dataMin - 1", "dataMax + 1"]} tickLine={false} axisLine={false} tick={axisTick} width={40} tickFormatter={(v: number) => String(Math.round(v * 10) / 10)} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} ${unit}`, METRIC_LABEL[m]]} />
                    <Line type="monotone" dataKey="value" stroke="var(--color-chart-1)" strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <details className="text-[12px]">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">All readings ({rows.length})</summary>
              <ul className="mt-2 divide-y divide-border">
                {rows.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 py-1">
                    <span className="flex-1 text-muted-foreground">{formatShortDate(r.measured_at.slice(0, 10), ws.locale)} {r.measured_at.slice(0, 4) !== ws.today.slice(0, 4) ? r.measured_at.slice(0, 4) : ""}</span>
                    <span className="tabular">{Number(r.value)} {r.unit}</span>
                    <ConfirmDelete size="icon-sm" label={`Delete ${METRIC_LABEL[m]} reading`} disabled={pending} title="Delete this reading?" description="It's removed from your charts." onConfirm={() => run(() => deleteMeasurements([r.id]))} />
                  </li>
                ))}
              </ul>
            </details>
          </Card>
        );
      })}
      {bp.length > 0 && (
        <Card className="grid content-start gap-3 p-4">
          <div className="flex items-baseline gap-2">
            <h2 className="flex items-center gap-1.5 text-[13px] font-medium"><HeartPulse className="size-4 text-muted-foreground" aria-hidden /> Blood pressure</h2>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => onEdit({ k: "measure", metric: "blood_pressure" })}><Plus /> Add</Button>
          </div>
          <ul className="divide-y divide-border text-[13px]">
            {bp.slice(0, 12).map((r) => (
              <li key={r.at} className="flex items-center gap-2 py-1.5">
                <span className="flex-1 text-[12px] text-muted-foreground">{formatShortDate(r.at.slice(0, 10), ws.locale)} · {formatTime(r.at, ws.timezone, ws.locale)}</span>
                <span className="tabular font-medium">{r.sys ?? "–"}/{r.dia ?? "–"}</span><span className="text-[11px] text-muted-foreground">mmHg</span>
                <ConfirmDelete size="icon-sm" label="Delete blood pressure reading" disabled={pending} title="Delete this reading?" description="Both numbers are deleted." onConfirm={() => run(() => deleteMeasurements(r.ids))} />
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground">Shown as recorded, without categories. Talk to a clinician about what your numbers mean for you.</p>
        </Card>
      )}
    </div>
  );
}

function pairBloodPressure(rows: MeasurementRow[]) {
  const by = new Map<string, { at: string; sys: number | null; dia: number | null; ids: string[] }>();
  for (const r of rows) {
    if (r.metric !== "blood_pressure_sys" && r.metric !== "blood_pressure_dia") continue;
    const e = by.get(r.measured_at) ?? { at: r.measured_at, sys: null, dia: null, ids: [] };
    if (r.metric === "blood_pressure_sys") e.sys = Number(r.value); else e.dia = Number(r.value);
    e.ids.push(r.id);
    by.set(r.measured_at, e);
  }
  return [...by.values()].sort((a, b) => b.at.localeCompare(a.at));
}

/* ------------------------------------------------------------------------ */

function TrendsTab({ ws }: { ws: HealthWorkspace }) {
  const [days, setDays] = useState(30);
  const from = addDays(ws.today, -days + 1);
  const series = wellnessByDay(ws.wellness, from, ws.today);
  const logged = series.filter((d) => d.checkins > 0);
  const water = hydrationByDay(ws.hydration, from, ws.today);

  return (
    <div className="grid gap-5">
      <div className="flex items-center gap-2">
        <div role="radiogroup" aria-label="Period" className="flex rounded-md bg-muted p-0.5">
          {[7, 30, 90].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={days === n} onClick={() => setDays(n)} className={cn("h-7 cursor-pointer rounded px-3 text-[13px] text-muted-foreground", days === n && "bg-surface font-medium text-foreground shadow-card")}>{n} days</button>
          ))}
        </div>
      </div>
      {logged.length === 0 ? (
        <Card><EmptyState icon={Smile} title={`No check-ins in the last ${days} days`}>Check in from the Today tab. Days without a check-in stay empty here; nothing is filled in.</EmptyState></Card>
      ) : (
        <Card className="grid gap-4 p-5">
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Mood" value={averageOf(series, "mood") ?? "–"} sub="average, 1–5" />
            <Stat label="Energy" value={averageOf(series, "energy") ?? "–"} sub="average, 1–5" />
            <Stat label="Stress" value={averageOf(series, "stress") ?? "–"} sub="average, 1–5 (higher is more)" />
          </div>
          <div className="h-56" role="img" aria-label={`Daily averages for the last ${days} days, ${logged.length} days with check-ins`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series.map((d) => ({ ...d, label: formatShortDate(d.date, ws.locale) }))} margin={{ top: 6, right: 6, left: -28, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="2 4" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} interval="preserveStartEnd" minTickGap={24} />
                <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tickLine={false} axisLine={false} tick={axisTick} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="mood" name="Mood" stroke="var(--color-chart-1)" strokeWidth={2} dot={days <= 30 ? { r: 2 } : false} connectNulls={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="energy" name="Energy" stroke="var(--color-chart-2)" strokeWidth={2} dot={days <= 30 ? { r: 2 } : false} connectNulls={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="stress" name="Stress" stroke="var(--color-chart-4)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-chart-1" aria-hidden /> Mood</span>
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-chart-2" aria-hidden /> Energy</span>
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-dashed border-chart-4" aria-hidden /> Stress</span>
            <span className="ml-auto">{logged.length} of {days} days checked in · gaps are days without one</span>
          </div>
        </Card>
      )}
      {water.some((d) => d.ml > 0) && (
        <Card className="grid gap-2 p-5">
          <h2 className="text-[13px] font-medium">Water per day</h2>
          <div className="h-32" role="img" aria-label={`Water logged per day over the last ${days} days`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={water.map((d) => ({ ...d, l: Math.round(d.ml / 100) / 10, label: formatShortDate(d.date, ws.locale) }))} margin={{ top: 4, right: 0, left: -28, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="2 4" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} interval="preserveStartEnd" minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} tick={axisTick} />
                <Tooltip cursor={{ fill: "var(--color-muted)" }} contentStyle={tooltipStyle} formatter={(v) => [`${v} L`, "Water"]} />
                <Bar dataKey="l" fill="var(--color-chart-2)" radius={[3, 3, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-muted-foreground">Only what you logged; an empty day means nothing was logged, not nothing drunk.</p>
        </Card>
      )}
    </div>
  );
}
