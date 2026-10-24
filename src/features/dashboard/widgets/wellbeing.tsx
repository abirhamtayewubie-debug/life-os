"use client";

import { Activity, Moon } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/data/empty-state";
import { formatShortDate, weekdayOf } from "@/lib/dates";
import type { DashboardModel } from "../compute";
import { WidgetCard } from "./widget-card";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const tooltipStyle = { background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 };
const fmtDur = (min: number) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m`;

export function SleepWidget({ m }: { m: DashboardModel }) {
  const s = m.sleep;
  return (
    <WidgetCard title="Sleep" description={s ? "Last 7 nights · self-reported quality" : undefined} href="/health?tab=sleep" source={s?.source}>
      {s ? (
        <>
          <div className="mb-3 flex gap-6">
            <div>
              <p className="tabular font-display text-xl font-semibold tracking-[-0.025em]">{s.avgMinutes ? fmtDur(s.avgMinutes) : "–"}</p>
              <p className="text-[11px] text-muted-foreground">{s.avgMinutes ? `avg over ${s.nights.length} nights` : "need 3+ nights for an average"}</p>
            </div>
            <div>
              <p className="tabular font-display text-xl font-semibold tracking-[-0.025em]">{s.avgQuality ?? "–"}<span className="text-sm font-normal text-muted-foreground">/5</span></p>
              <p className="text-[11px] text-muted-foreground">avg quality</p>
            </div>
          </div>
          <div className="h-28" role="img" aria-label={`Sleep durations: ${s.nights.map((n) => `${formatShortDate(n.date)} ${fmtDur(n.minutes)}`).join(", ")}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={s.nights.map((n) => ({ ...n, hours: Math.round((n.minutes / 60) * 10) / 10, wd: WD[weekdayOf(n.date)] }))} margin={{ top: 4, right: 0, left: -28, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="2 4" />
                <XAxis dataKey="wd" tickLine={false} axisLine={false} tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }} />
                <YAxis domain={[0, 10]} ticks={[0, 4, 7, 10]} tickLine={false} axisLine={false} tick={{ fill: "var(--color-subtle-foreground)", fontSize: 10 }} />
                <ReferenceLine y={7} stroke="var(--color-chart-5)" strokeDasharray="3 3" />
                <Tooltip cursor={{ fill: "var(--color-muted)" }} contentStyle={tooltipStyle} formatter={(v) => [`${v} h`, "Sleep"]} labelFormatter={(_, p) => (p?.[0] ? formatShortDate(p[0].payload.date) : "")} />
                <Bar dataKey="hours" fill="var(--color-chart-1)" radius={[3, 3, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <EmptyState compact icon={Moon} title="No sleep logged">
          Log bedtime and wake time manually, or connect a device later. Nothing is estimated for you.
        </EmptyState>
      )}
    </WidgetCard>
  );
}

export function WellnessWidget({ m }: { m: DashboardModel }) {
  const w = m.wellness;
  return (
    <WidgetCard title="Mood & energy" description={w ? "Your check-ins, 1–5" : undefined} href="/health" source={w?.source}>
      {w ? (
        <>
          <div className="h-32" role="img" aria-label={`Mood and energy check-ins: ${w.days.map((d) => `${formatShortDate(d.date)} mood ${d.mood ?? "none"}, energy ${d.energy ?? "none"}`).join("; ")}`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={w.days.map((d) => ({ ...d, wd: WD[weekdayOf(d.date)] }))} margin={{ top: 6, right: 6, left: -30, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="2 4" />
                <XAxis dataKey="wd" tickLine={false} axisLine={false} tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }} />
                <YAxis domain={[1, 5]} ticks={[1, 3, 5]} tickLine={false} axisLine={false} tick={{ fill: "var(--color-subtle-foreground)", fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={(_, p) => (p?.[0] ? formatShortDate(p[0].payload.date) : "")} />
                <Line type="monotone" dataKey="mood" name="Mood" stroke="var(--color-chart-1)" strokeWidth={1.75} dot={{ r: 2.5 }} connectNulls={false} />
                <Line type="monotone" dataKey="energy" name="Energy" stroke="var(--color-chart-2)" strokeWidth={1.75} dot={{ r: 2.5 }} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex gap-4 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="h-0.5 w-3 bg-chart-1" /> Mood</span>
            <span className="inline-flex items-center gap-1"><span className="h-0.5 w-3 bg-chart-2" /> Energy</span>
            <span className="ml-auto">{w.days.length} of 7 days logged</span>
          </div>
        </>
      ) : (
        <EmptyState compact icon={Activity} title="No check-ins this week">Use the evening review to note mood and energy if you want to see patterns over time.</EmptyState>
      )}
    </WidgetCard>
  );
}
