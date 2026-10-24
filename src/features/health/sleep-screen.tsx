"use client";

import { useEffect, useState } from "react";
import { Moon, Pencil, Plus } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ConfirmDelete } from "@/components/data/confirm-delete";
import { EmptyState } from "@/components/data/empty-state";
import { ProvenanceBadge } from "@/components/data/provenance";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addDays, formatShortDate, formatTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { deleteSleep } from "@/server/actions/health";
import { useServerAction } from "@/features/dashboard/use-server-action";
import { SleepForm } from "./forms";
import { axisTick, tooltipStyle } from "./health-screen";
import { formatMinutes, sleepSummary } from "./metrics";
import type { HealthWorkspace, SleepLog } from "./types";

export function SleepScreen({ ws, startNew = false }: { ws: HealthWorkspace; startNew?: boolean }) {
  const { run, pending } = useServerAction();
  const [editing, setEditing] = useState<SleepLog | "new" | null>(startNew ? "new" : null);
  const [days, setDays] = useState(14);
  const from = addDays(ws.today, -days + 1);
  const nights = ws.sleep.filter((n) => n.sleep_date >= from).sort((a, b) => a.sleep_date.localeCompare(b.sleep_date));
  const s = sleepSummary(nights, ws.timezone);
  const loggedToday = ws.sleep.some((n) => n.sleep_date === ws.today);

  useEffect(() => {
    const onNew = () => setEditing("new");
    window.addEventListener("lifeos:new-sleep", onNew);
    return () => window.removeEventListener("lifeos:new-sleep", onNew);
  }, []);

  const chart = Array.from({ length: days }, (_, i) => addDays(from, i)).map((d) => {
    const n = nights.find((x) => x.sleep_date === d);
    return { date: d, label: formatShortDate(d, ws.locale), hours: n ? Math.round((n.duration_minutes / 60) * 10) / 10 : null };
  });

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Period" className="flex rounded-md bg-muted p-0.5">
          {[7, 14, 30, 90].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={days === n} onClick={() => setDays(n)} className={cn("h-7 cursor-pointer rounded px-3 text-[13px] text-muted-foreground", days === n && "bg-surface font-medium text-foreground shadow-card")}>{n} nights</button>
          ))}
        </div>
        <Button size="sm" className="ml-auto" onClick={() => setEditing("new")}><Plus /> {loggedToday ? "Log a night" : "Log last night"}</Button>
      </div>

      {ws.sleep.length === 0 ? (
        <Card>
          <EmptyState icon={Moon} title="No sleep logged yet" action={<Button size="sm" onClick={() => setEditing("new")}><Plus /> Log last night</Button>}>
            Enter when you went to sleep and woke up. A device connection can fill this in later (phase 7); until then nothing is estimated for you.
          </EmptyState>
        </Card>
      ) : (
        <>
          <Card className="grid gap-5 p-5">
            {nights.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No nights logged in the last {days} days.</p>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Average" value={s.avgMinutes ? formatMinutes(s.avgMinutes) : "–"} sub={`${s.nights} of ${days} nights logged`} />
                <Stat label="Typical bedtime" value={s.avgBedtime ? clockLabel(s.avgBedtime, ws.locale) : "–"} sub={s.bedtimeSpread !== null ? `usually within ±${s.bedtimeSpread} min` : "needs 3+ nights"} />
                <Stat label="Typical wake" value={s.avgWake ? clockLabel(s.avgWake, ws.locale) : "–"} />
                <Stat label="How rested" value={s.avgQuality !== null ? `${s.avgQuality}/5` : "–"} sub="your own rating" />
              </div>
            )}
            <div className="h-44" role="img" aria-label={`Hours slept per night: ${chart.filter((c) => c.hours !== null).map((c) => `${c.label} ${c.hours} hours`).join(", ") || "none logged"}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ top: 6, right: 0, left: -28, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="2 4" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} interval="preserveStartEnd" minTickGap={20} />
                  <YAxis domain={[0, 10]} ticks={[0, 4, 7, 10]} tickLine={false} axisLine={false} tick={axisTick} />
                  <ReferenceLine y={7} stroke="var(--color-chart-5)" strokeDasharray="3 3" />
                  <Tooltip cursor={{ fill: "var(--color-muted)" }} contentStyle={tooltipStyle} formatter={(v) => [`${v} h`, "Slept"]} />
                  <Bar dataKey="hours" fill="var(--color-chart-1)" radius={[3, 3, 0, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[11px] text-muted-foreground">The dashed line is 7 hours, a common guideline for adults. Empty days weren&apos;t logged. Times are from what you entered, not a device.</p>
          </Card>

          <Card className="divide-y divide-border">
            {[...ws.sleep].sort((a, b) => b.sleep_date.localeCompare(a.sleep_date)).slice(0, days).map((n) => (
              <div key={n.id} className="group flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                <span className="w-16 text-[12px] text-muted-foreground">{formatShortDate(n.sleep_date, ws.locale)}</span>
                <span className="tabular text-[13px] font-medium">{formatMinutes(n.duration_minutes)}</span>
                <span className="text-[12px] text-muted-foreground">{formatTime(n.bedtime, ws.timezone, ws.locale)} → {formatTime(n.wake_time, ws.timezone, ws.locale)}</span>
                {n.quality && <span className="text-[12px] text-muted-foreground">rested {n.quality}/5</span>}
                {n.awakenings !== null && n.awakenings > 0 && <span className="text-[12px] text-muted-foreground">woke {n.awakenings}×</span>}
                <ProvenanceBadge source={n.source} />
                {n.device_name && <span className="text-[11px] text-muted-foreground">{n.device_name}</span>}
                {n.notes && <span className="basis-full truncate pl-[4.75rem] text-[12px] text-muted-foreground">{n.notes}</span>}
                <span className="ml-auto flex items-center gap-0.5 pointer-fine:opacity-0 pointer-fine:group-focus-within:opacity-100 pointer-fine:group-hover:opacity-100">
                  <Button size="icon-sm" variant="ghost" className="size-7 text-muted-foreground" aria-label={`Edit the night of ${n.sleep_date}`} onClick={() => setEditing(n)}><Pencil /></Button>
                  <ConfirmDelete size="icon-sm" label={`Delete the night of ${n.sleep_date}`} disabled={pending} title="Delete this night?" description="It's removed from your averages and reports." onConfirm={() => run(() => deleteSleep(n.id))} />
                </span>
              </div>
            ))}
          </Card>
        </>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Log a night" : "Edit night"}</DialogTitle>
            <DialogDescription className="sr-only">Bedtime, wake time and how rested you feel</DialogDescription>
          </DialogHeader>
          {editing && <SleepForm ws={ws} night={editing === "new" ? null : editing} onDone={() => setEditing(null)} onCancel={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** "23:35" in the person's own clock style, matching the times in the list. */
function clockLabel(hhmm: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC", hour: "numeric", minute: "2-digit" }).format(new Date(`2000-01-01T${hhmm}:00Z`));
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="grid content-start gap-0.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="tabular font-display text-xl font-normal tracking-[-0.01em]">{value}</span>
      {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
    </div>
  );
}
