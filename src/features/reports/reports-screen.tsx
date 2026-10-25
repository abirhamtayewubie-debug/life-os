"use client";

import { usePathname, useRouter } from "next/navigation";
import { Briefcase, CheckCircle2, ChevronLeft, ChevronRight, GraduationCap, HeartPulse, Leaf, Printer, Save, Sparkles, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatMoney, fromMinor, toMinor, type Money } from "@/lib/money";
import { cn } from "@/lib/utils";
import { saveReportSnapshot } from "@/server/actions/reports";
import { interpretReport } from "@/server/actions/assistant";
import { modelLabel } from "@/features/assistant/models";
import type { ReportView } from "@/server/reports";
import { useServerAction } from "@/features/dashboard/use-server-action";
import { Markdown } from "@/features/assistant/markdown";
import { formatMinutes } from "@/features/health/metrics";
import { delta, periodLabel, PERIODS, shiftPeriod, type ReportPeriod, type TrackedArea } from "./compute";

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
  /** An area with nothing ever logged reads "Not tracked" rather than a zero. */
  const off = (area: TrackedArea) => !c.tracked[area];
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <div role="radiogroup" aria-label="Report period" className="flex rounded-full bg-tint-mist p-1">
          {PERIODS.map((x) => (
            <button key={x.v} type="button" role="radio" aria-checked={r.period === x.v} onClick={() => go(x.v, r.start <= r.today && r.end >= r.today ? null : r.start)}
              className={cn("h-9 cursor-pointer rounded-full px-3.5 text-[13px] text-muted-foreground", r.period === x.v && "bg-card font-medium text-foreground shadow-clay")}>{x.label}</button>
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
          {off("workouts") ? <NotTracked label="Workouts" where="Log one in Health." /> : (
            <Row label="Workouts" value={c.health.workouts} d={delta(c.health.workouts, p.health.workouts)} vs={vs}
              sub={c.health.workouts ? `${c.health.activeDays} active day${c.health.activeDays === 1 ? "" : "s"}${c.health.workoutMinutes ? ` · ${formatMinutes(c.health.workoutMinutes)} timed` : ""}` : undefined} />
          )}
          {off("sleep") ? <NotTracked label="Sleep" where="Log a night in Health." /> : <Row label="Sleep, average" value={c.health.sleepAvgMinutes ? formatMinutes(c.health.sleepAvgMinutes) : "–"} d={c.health.sleepAvgMinutes && p.health.sleepAvgMinutes ? c.health.sleepAvgMinutes - p.health.sleepAvgMinutes : null} unit=" min" vs={vs}
            sub={c.health.nights ? `${c.health.nights} night${c.health.nights === 1 ? "" : "s"} logged${c.health.restedAvg ? ` · rested ${c.health.restedAvg}/5` : ""}` : "No nights logged"} />}
          {off("checkins") ? <NotTracked label="Mood · energy · stress" where="Do a check-in in Health." /> : <Row label="Mood · energy · stress" value={c.health.checkinDays ? `${c.health.mood ?? "–"} · ${c.health.energy ?? "–"} · ${c.health.stress ?? "–"}` : "–"}
            sub={c.health.checkinDays ? `Averages on 1–5, from ${c.health.checkinDays} day${c.health.checkinDays === 1 ? "" : "s"} of check-ins` : "No check-ins"} />}
          {off("water") ? <NotTracked label="Water" where="Add a glass in Health." /> : <Row label="Water, average" value={c.health.waterAvgMl ? `${(c.health.waterAvgMl / 1000).toFixed(1)} L` : "–"}
            sub={c.health.waterDays ? `on ${c.health.waterDays} logged day${c.health.waterDays === 1 ? "" : "s"}` : "Nothing logged"} />}
        </Section>

        <Section icon={Wallet} title="Money">
          {c.money.length === 0 ? <p className="text-[13px] text-muted-foreground">{off("money") ? "Not tracked yet. Income and spending from Finance show here." : "No income or spending recorded."}</p> : c.money.map((m) => {
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

        <Section icon={Briefcase} title="Work & projects">
          {off("projects") ? <NotTracked label="Projects finished" where="Add a project in Work." /> : (
            <Row label="Projects finished" value={c.work.projectsCompleted.length} d={delta(c.work.projectsCompleted.length, p.work.projectsCompleted.length)} vs={vs}
              sub="Counted from the day a project is marked completed." />
          )}
          {c.work.projectsCompleted.length > 0 && <List label="Finished" items={c.work.projectsCompleted} />}
          <Row label="Milestones reached" value={c.work.milestones} d={delta(c.work.milestones, p.work.milestones)} vs={vs} />
        </Section>

        <Section icon={GraduationCap} title="Learning">
          {off("study") ? <NotTracked label="Study time" where="Log a session in Learning." /> : (
            <Row label="Study time" value={c.learning.minutes ? formatMinutes(c.learning.minutes) : "–"} d={c.learning.minutes || p.learning.minutes ? c.learning.minutes - p.learning.minutes : null} unit=" min" vs={vs}
              sub={c.learning.sessions ? `${plural(c.learning.sessions, "session")} on ${plural(c.learning.days, "day")}, reading included` : "No sessions logged"} />
          )}
          <Row label="Roadmap steps done" value={c.learning.stepsDone} d={delta(c.learning.stepsDone, p.learning.stepsDone)} vs={vs} />
          {c.learning.finished.length > 0 && <List label="Courses and videos finished" items={c.learning.finished} />}
        </Section>

        <Section icon={Leaf} title="Reflection">
          {off("meditation") ? <NotTracked label="Meditation" where="Log a practice in Reflection." /> : (
            <Row label="Meditation" value={c.reflection.meditationMinutes ? formatMinutes(c.reflection.meditationMinutes) : "–"} d={c.reflection.meditationMinutes || p.reflection.meditationMinutes ? c.reflection.meditationMinutes - p.reflection.meditationMinutes : null} unit=" min" vs={vs}
              sub={c.reflection.meditationSessions ? `${plural(c.reflection.meditationSessions, "session")} on ${plural(c.reflection.meditationDays, "day")}` : "No practice logged"} />
          )}
          {off("reading") ? <NotTracked label="Reading" where="Add a book in Reflection." /> : (
            <Row label="Pages read" value={c.reflection.pages || (c.reflection.readingMinutes ? "–" : 0)} d={delta(c.reflection.pages, p.reflection.pages)} vs={vs}
              sub={c.reflection.readingMinutes ? `${formatMinutes(c.reflection.readingMinutes)} on ${plural(c.reflection.readingDays, "day")}${c.reflection.pages ? "" : " · no page numbers noted"}` : "No reading logged"} />
          )}
          {c.reflection.booksFinished.length > 0 && <List label="Books finished" items={c.reflection.booksFinished} />}
          {off("journal") ? <NotTracked label="Days journaled" where="Write an entry in Reflection." /> : (
            <Row label="Days journaled" value={c.life.journalDays} d={delta(c.life.journalDays, p.life.journalDays)} vs={vs} sub="Counted by date only; entries aren't read." />
          )}
          {off("reviews") ? <NotTracked label="Reviews written" where="Write one in Reflection, Reviews." /> : (
            <Row label="Reviews written" value={c.reflection.reviews.evening + c.reflection.reviews.weekly + c.reflection.reviews.monthly}
              sub={[c.reflection.reviews.evening && plural(c.reflection.reviews.evening, "evening review"), c.reflection.reviews.weekly && plural(c.reflection.reviews.weekly, "weekly review"), c.reflection.reviews.monthly && plural(c.reflection.reviews.monthly, "monthly review")].filter(Boolean).join(" · ") || "None this time"} />
          )}
        </Section>

        <Section icon={Users} title="People & goals">
          {off("people") ? <NotTracked label="People you were in touch with" where="Log a call or visit in People." /> : (
            <Row label="People you were in touch with" value={c.life.interactions} d={delta(c.life.interactions, p.life.interactions)} vs={vs} sub="Logged interactions" />
          )}
          {c.life.goalsAchieved.length > 0 ? <List label="Goals achieved" items={c.life.goalsAchieved} /> : <Row label="Goals achieved" value={0} />}
        </Section>
      </div>

      <Card className="grid gap-2 border-dashed p-5">
        <h2 className="flex items-center gap-2 text-[13px] font-medium"><Sparkles className="size-4 text-muted-foreground" aria-hidden /> Interpretation</h2>
        {r.interpretation ? (
          <>
            <p className="text-[11px] text-muted-foreground">
              Written by {modelLabel(r.interpretationModel)}{r.interpretedAt ? ` on ${new Date(r.interpretedAt).toLocaleString(r.locale, { dateStyle: "medium", timeStyle: "short" })}` : ""} from the saved snapshot. It&apos;s a reading of the numbers, not a measurement, and can be wrong.
            </p>
            <Markdown text={r.interpretation} />
          </>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            Everything above is counted straight from what you logged. {r.savedAt
              ? "The assistant can write a short reading of the saved snapshot. It appears here, labelled, apart from the numbers."
              : "Save a snapshot first; the assistant can then write a short reading of it here, kept apart from the numbers."}
          </p>
        )}
        {!r.demo && r.savedAt && (
          <div className="print:hidden">
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => interpretReport({ period: r.period, start: r.start }))}>
              <Sparkles /> {r.interpretation ? "Rewrite" : "Write a reading"}
            </Button>
          </div>
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
  // Big minute changes read better in hours.
  if (unit === " min" && Math.abs(d) >= 60) { d = Math.round(d / 6) / 10; unit = " h"; }
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

function NotTracked({ label, where }: { label: string; where: string }) {
  return (
    <div className="grid gap-0.5">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="min-w-0 flex-1 text-[13px] text-muted-foreground">{label}</span>
        <span className="text-[13px] text-muted-foreground">Not tracked</span>
      </div>
      <span className="text-[11px] text-muted-foreground">Nothing logged yet. {where}</span>
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

