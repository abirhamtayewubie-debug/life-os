"use client";

import { useMemo, useState } from "react";
import { TrendingUp, Trophy } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/data/empty-state";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/input";
import { formatShortDate } from "@/lib/dates";
import { exerciseKey, exerciseList, exerciseProgress, recordsFor, type Best } from "./records";
import type { HealthWorkspace } from "./types";

const tooltipStyle = { background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 };
const axisTick = { fill: "var(--color-muted-foreground)", fontSize: 10 };

function RecordTile({ label, best, unit, locale }: { label: string; best: Best | null; unit: string; locale: string }) {
  return (
    <div className="grid content-start gap-0.5 rounded-xl border border-border p-3">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="tabular font-display text-xl font-normal tracking-[-0.01em]">
        {best ? <>{best.value.toLocaleString(locale)}<span className="text-sm font-normal text-muted-foreground"> {unit}</span></> : "–"}
      </span>
      {best && <span className="text-[11px] text-muted-foreground">{[best.detail, formatShortDate(best.date, locale)].filter(Boolean).join(" · ")}</span>}
    </div>
  );
}

/** Personal records and progress per exercise, from every set ever logged. */
export function ProgressTab({ ws }: { ws: HealthWorkspace }) {
  const unit = ws.system === "imperial" ? "lb" : "kg";
  const exercises = useMemo(() => exerciseList(ws.exerciseLog), [ws.exerciseLog]);
  const [key, setKey] = useState(exercises[0]?.key ?? "");
  const current = exercises.some((e) => e.key === key) ? key : exercises[0]?.key ?? "";
  const rec = useMemo(() => (current ? recordsFor(ws.exerciseLog, current, unit) : null), [ws.exerciseLog, current, unit]);
  const points = useMemo(() => (current ? exerciseProgress(ws.exerciseLog, current, unit) : []), [ws.exerciseLog, current, unit]);
  const allBests = useMemo(() => exercises.map((e) => recordsFor(ws.exerciseLog, e.key, unit)), [exercises, ws.exerciseLog, unit]);

  if (!exercises.length || !rec) {
    return (
      <Card>
        <EmptyState icon={TrendingUp} title="Nothing to chart yet">
          Add sets (exercise, reps, weight) when you log a workout, or start one from a program. Records and progress charts build from those.
        </EmptyState>
      </Card>
    );
  }

  const weighted = points.some((p) => p.top !== null);
  const history = [...points].reverse();
  const setLabel = (s: (typeof ws.exerciseLog)[number]) =>
    s.weight ? `${s.reps ?? "–"}×${Number(s.weight)}${s.weight_unit}` : s.distance_m ? `${Number(s.distance_m) / 1000} km` : `${s.reps ?? "–"} reps`;
  const detail = (date: string) => ws.exerciseLog
    .filter((s) => exerciseKey(s.exercise) === current && s.date === date)
    .sort((a, b) => a.workout_id.localeCompare(b.workout_id) || a.set_number - b.set_number)
    .map(setLabel)
    .join(", ");

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="pr-exercise" className="text-[13px] font-medium">Exercise</label>
        <NativeSelect id="pr-exercise" value={current} onChange={(e) => setKey(e.target.value)} className="h-8 w-auto min-w-48">
          {exercises.map((e) => <option key={e.key} value={e.key}>{e.name} ({e.sessions})</option>)}
        </NativeSelect>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Card className="grid content-start gap-3 p-5">
          <h2 className="flex items-center gap-1.5 text-[13px] font-medium"><Trophy className="size-4 text-muted-foreground" aria-hidden /> {rec.name} records</h2>
          <div className="grid grid-cols-2 gap-2">
            <RecordTile label="Heaviest set" best={rec.heaviest} unit={unit} locale={ws.locale} />
            <RecordTile label="Estimated 1-rep max" best={rec.estimatedMax} unit={unit} locale={ws.locale} />
            <RecordTile label="Most reps in a set" best={rec.mostReps} unit="reps" locale={ws.locale} />
            {rec.longest ? <RecordTile label="Longest distance" best={rec.longest} unit="km" locale={ws.locale} />
              : <RecordTile label="Best session volume" best={rec.bestSession} unit={unit} locale={ws.locale} />}
          </div>
          <p className="text-[11px] text-muted-foreground">Estimated max uses the Epley formula on sets of 12 reps or fewer. It&apos;s a guide, not a test result.</p>
        </Card>

        <Card className="grid content-start gap-2 p-5">
          <h2 className="label-caps">{weighted ? "Top set and estimated max" : "Reps per session"}</h2>
          {points.length < 2 ? (
            <p className="text-[13px] text-muted-foreground">Log {rec.name} in another workout to see a trend.</p>
          ) : (
            <div className="h-48" role="img" aria-label={`${rec.name} progress: ${points.map((p) => `${formatShortDate(p.date, ws.locale)} ${weighted ? `${p.top ?? "–"} ${unit}` : `${p.reps} reps`}`).join(", ")}`}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points.map((p) => ({ ...p, label: formatShortDate(p.date, ws.locale) }))} margin={{ top: 6, right: 6, left: -16, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="2 4" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} interval="preserveStartEnd" minTickGap={24} />
                  <YAxis domain={["dataMin - 5", "dataMax + 5"]} tickLine={false} axisLine={false} tick={axisTick} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  {weighted ? (
                    <>
                      <Line type="monotone" dataKey="top" name={`Top set (${unit})`} stroke="var(--color-chart-1)" strokeWidth={2} dot={{ r: 2.5 }} connectNulls isAnimationActive={false} />
                      <Line type="monotone" dataKey="estimatedMax" name={`Est. max (${unit})`} stroke="var(--color-chart-2)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls isAnimationActive={false} />
                    </>
                  ) : (
                    <Line type="monotone" dataKey="reps" name="Reps" stroke="var(--color-chart-1)" strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={false} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {weighted && points.length >= 2 && (
            <div className="flex gap-4 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-chart-1" aria-hidden /> Top set</span>
              <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-dashed border-chart-2" aria-hidden /> Estimated max</span>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="grid content-start gap-2 p-5">
          <h2 className="label-caps">{rec.name} log</h2>
          <ul className="divide-y divide-border text-[12px]">
            {history.slice(0, 30).map((p, i) => (
              <li key={`${p.date}-${i}`} className="flex flex-wrap gap-x-3 gap-y-0.5 py-1.5">
                <span className="w-16 text-muted-foreground">{formatShortDate(p.date, ws.locale)}</span>
                <span className="min-w-0 flex-1 tabular">{detail(p.date)}</span>
                {p.volume > 0 && <span className="tabular text-muted-foreground">{p.volume.toLocaleString(ws.locale)} {unit}</span>}
              </li>
            ))}
          </ul>
        </Card>
        <Card className="grid content-start gap-2 p-5">
          <h2 className="label-caps">All personal records</h2>
          <ul className="divide-y divide-border text-[12px]">
            {allBests.map((r) => (
              <li key={r.key}>
                <button type="button" onClick={() => setKey(r.key)} className="flex w-full cursor-pointer gap-3 py-1.5 text-left hover:text-foreground">
                  <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
                  <span className="tabular text-muted-foreground">
                    {r.heaviest ? `${r.heaviest.value} ${unit}` : r.longest ? `${r.longest.value} km` : r.mostReps ? `${r.mostReps.value} reps` : "–"}
                  </span>
                  <span className="w-14 text-right text-muted-foreground">{formatShortDate((r.heaviest ?? r.longest ?? r.mostReps)?.date ?? ws.today, ws.locale)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
