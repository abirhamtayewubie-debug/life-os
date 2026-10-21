"use client";

import { usePathname, useRouter } from "next/navigation";
import { BookOpen, CheckCircle2, ChevronLeft, ChevronRight, HeartPulse, Printer, Save, Sparkles, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatMoney, fromMinor, toMinor, type Money } from "@/lib/money";
import { cn } from "@/lib/utils";
import { saveReportSnapshot } from "@/server/actions/reports";
import type { ReportView } from "@/server/reports";
import { useServerAction } from "@/features/dashboard/use-server-action";
import { formatMinutes } from "@/features/health/metrics";
import { delta, periodLabel, PERIODS, shiftPeriod, type ReportPeriod } from "./compute";

const NOUN: Record<ReportPeriod, string> = { daily: "day", weekly: "week", monthly: "month", quarterly: "quarter", annual: "year" };

export function ReportsScreen({ r }: { r: ReportView }) {
  const router = useRouter();
  const pathname = usePathname();
  const { run, pending } = useServerAction();
  const go = (period: ReportPeriod, date: string | null) => router.replace(`${pathname}?period=${period}${date ? `&date=${date}` : ""}`, { scroll: false });
  const next = shiftPeriod(r.period, r.start, 1);
  const c = r.current;
  const p = r.previous;
  const noun = NOUN[r.period];
  const running = r.end > r.today;
  const vs = `vs last ${noun}`;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <div role="radiogroup" aria-label="Report period" className="flex rounded-md bg-muted p-0.5">
          {PERIODS.map((x) => (
            <button key={x.v} type="button" role="radio" aria-checked={r.period === x.v} onClick={() => go(x.v, r.start <= r.today && r.end >= r.today ? null : r.start)}
              className={cn("h-7 cursor-pointer rounded px-3 text-[13px] text-muted-foreground", r.period === x.v && "bg-surface font-medium text-foreground shadow-card")}>{x.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon-sm" variant="ghost" aria-label={`Previous ${noun}`} onClick={() => go(r.period, shiftPeriod(r.period, r.start, -1))}><ChevronLeft /></Button>
          <span className="min-w-36 text-center text-[13px] font-medium">{periodLabel(r.period, r.start, r.end, r.locale)}</span>
          <Button size="icon-sm" variant="ghost" aria-label={`Next ${noun}`} disabled={next > r.today} onClick={() => go(r.period, next)}><ChevronRight /></Button>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => window.print()}><Printer /> Print</Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => saveReportSnapshot({ period: r.period, date: r.start }))}><Save /> {r.savedAt ? "Update snapshot" : "Save snapshot"}</Button>
        </div>
      </div>

      <div className="hidden print:block">
        <h2 className="text-lg font-semibold">{periodLabel(r.period, r.start, r.end, r.locale)}</h2>
      </div>

      <p className="text-[12px] text-muted-foreground">
        {c.daysWithData} of {c.days} day{c.days === 1 ? "" : "s"} have something logged{running ? ` so far (this ${noun} is still running)` : ""}.
        {" "}Changes compare with the same number of days last {noun}.
        {r.savedAt && <> Snapshot saved {new Date(r.savedAt).toLocaleString(r.locale, { dateStyle: "medium", timeStyle: "short" })}.</>}
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section icon={CheckCircle2} title="Getting things done">
          <Row label="Tasks completed" value={c.tasks.completed} d={delta(c.tasks.completed, p.tasks.completed)} vs={vs}
            sub={c.tasks.completed ? `${c.tasks.onTime} on time · ${c.tasks.late} after the due date · ${c.tasks.noDueDate} without one` : undefined} />
          <Row label="Habits kept" value={c.habits.rate !== null ? `${c.habits.rate}%` : "–"} d={delta(c.habits.rate, p.habits.rate)} unit=" pts" vs={vs}
            sub={c.habits.scheduled ? `${c.habits.kept} of ${c.habits.scheduled} scheduled days (daily habits)` : "No daily habits scheduled"} />
          <Row label="Focus time logged" value={c.focus.minutes ? formatMinutes(c.focus.minutes) : "–"} d={c.focus.minutes || p.focus.minutes ? Math.round((c.focus.minutes - p.focus.minutes) / 6) / 10 : null} unit=" h" vs={vs}
            sub={c.focus.byProject.length ? c.focus.byProject.map((x) => `${x.project ? r.projectNames[x.project] ?? "Removed project" : "No project"} ${formatMinutes(x.minutes)}`).join(" · ") : undefined} />
        </Section>

        <Section icon={HeartPulse} title="Health">
          <Row label="Workouts" value={c.health.workouts} d={delta(c.health.workouts, p.health.workouts)} vs={vs}
            sub={c.health.workouts ? `${c.health.activeDays} active day${c.health.activeDays === 1 ? "" : "s"}${c.health.workoutMinutes ? ` · ${formatMinutes(c.health.workoutMinutes)} timed` : ""}` : undefined} />
          <Row label="Sleep, average" value={c.health.sleepAvgMinutes ? formatMinutes(c.health.sleepAvgMinutes) : "–"} d={c.health.sleepAvgMinutes && p.health.sleepAvgMinutes ? c.health.sleepAvgMinutes - p.health.sleepAvgMinutes : null} unit=" min" vs={vs}
            sub={c.health.nights ? `${c.health.nights} night${c.health.nights === 1 ? "" : "s"} logged${c.health.restedAvg ? ` · rested ${c.health.restedAvg}/5` : ""}` : "No nights logged"} />
          <Row label="Mood · energy · stress" value={c.health.checkinDays ? `${c.health.mood ?? "–"} · ${c.health.energy ?? "–"} · ${c.health.stress ?? "–"}` : "–"}
            sub={c.health.checkinDays ? `Averages on 1–5, from ${c.health.checkinDays} day${c.health.checkinDays === 1 ? "" : "s"} of check-ins` : "No check-ins"} />
          <Row label="Water, average" value={c.health.waterAvgMl ? `${(c.health.waterAvgMl / 1000).toFixed(1)} L` : "–"}
            sub={c.health.waterDays ? `on ${c.health.waterDays} logged day${c.health.waterDays === 1 ? "" : "s"}` : "Nothing logged"} />
        </Section>

        <Section icon={Wallet} title="Money">
          {c.money.length === 0 ? <p className="text-[13px] text-muted-foreground">No income or spending recorded.</p> : c.money.map((m) => {
            const before = p.money.find((x) => x.currency === m.currency);
            return (
              <div key={m.currency} className="grid grid-cols-3 gap-2 text-[13px]">
                <MoneyStat label="In" m={m.income} before={before?.income} vs={vs} locale={r.locale} />
                <MoneyStat label="Out" m={m.expenses} before={before?.expenses} vs={vs} locale={r.locale} />
                <MoneyStat label="Left" m={m.net} signed locale={r.locale} />
              </div>
            );
          })}
          {c.money.length > 1 && <p className="text-[11px] text-muted-foreground">One row per currency; they aren&apos;t added together.</p>}
        </Section>

        <Section icon={BookOpen} title="Life">
          <Row label="Days journaled" value={c.life.journalDays} d={delta(c.life.journalDays, p.life.journalDays)} vs={vs} sub="Counted by date only; entries aren't read." />
          <Row label="People you were in touch with" value={c.life.interactions} d={delta(c.life.interactions, p.life.interactions)} vs={vs} sub="Logged interactions" />
          <Row label="Milestones reached" value={c.life.milestones} />
          {c.life.goalsAchieved.length > 0 && <List label="Goals achieved" items={c.life.goalsAchieved} />}
          {c.life.learningFinished.length > 0 && <List label="Finished learning" items={c.life.learningFinished} />}
        </Section>
      </div>

      <Card className="grid gap-2 border-dashed p-5">
        <h2 className="flex items-center gap-2 text-[13px] font-medium"><Sparkles className="size-4 text-muted-foreground" aria-hidden /> Interpretation</h2>
        {r.interpretation ? (
          <>
            <p className="text-[11px] text-muted-foreground">Written by the assistant from the saved snapshot. It&apos;s a reading of the numbers above, not a measurement.</p>
            <p className="text-[13px] whitespace-pre-wrap">{r.interpretation}</p>
          </>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            Everything above is counted straight from what you logged. Written observations come with the assistant (phase 6, after you approve it). They&apos;ll appear here, labelled, and kept apart from the numbers.
          </p>
        )}
      </Card>
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <Card className="grid content-start gap-4 p-5 break-inside-avoid">
      <h2 className="flex items-center gap-2 text-[13px] font-medium"><Icon className="size-4 text-muted-foreground" aria-hidden /> {title}</h2>
      {children}
    </Card>
  );
}

function Change({ d, unit = "", vs }: { d: number | null | undefined; unit?: string; vs?: string }) {
  if (d === null || d === undefined || !vs) return null;
  return <span className="text-[11px] text-muted-foreground">{d === 0 ? `same as last time` : `${d > 0 ? "+" : ""}${d}${unit} ${vs}`}</span>;
}

function Row({ label, value, sub, d, unit, vs }: { label: string; value: React.ReactNode; sub?: string; d?: number | null; unit?: string; vs?: string }) {
  return (
    <div className="grid gap-0.5">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="min-w-0 flex-1 text-[13px] text-muted-foreground">{label}</span>
        <Change d={d} unit={unit} vs={vs} />
        <span className="tabular text-[17px] font-semibold tracking-tight">{value}</span>
      </div>
      {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

function MoneyStat({ label, m, before, signed = false, vs, locale }: { label: string; m: Money; before?: Money; signed?: boolean; vs?: string; locale: string }) {
  const diff = before ? toMinor(m.amount, m.currency) - toMinor(before.amount, m.currency) : null;
  return (
    <div className="grid gap-0.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="tabular font-semibold">{formatMoney(m, locale, { signed })}</span>
      {diff !== null && vs && diff !== 0n && <span className="text-[11px] text-muted-foreground">{formatMoney({ amount: fromMinor(diff, m.currency), currency: m.currency }, locale, { signed: true })} {vs}</span>}
    </div>
  );
}

function List({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="grid gap-1">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <ul className="grid gap-0.5 text-[13px]">{items.map((t, i) => <li key={i}>• {t}</li>)}</ul>
    </div>
  );
}

