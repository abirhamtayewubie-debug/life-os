"use client";

import { Timer } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ConfirmDelete } from "@/components/data/confirm-delete";
import { EmptyState } from "@/components/data/empty-state";
import { FormActions, useActionForm } from "@/components/data/action-form";
import { ProvenanceBadge } from "@/components/data/provenance";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { addDays, formatShortDate } from "@/lib/dates";
import { deleteStudySession, logStudySession } from "@/server/actions/learning";
import { useServerAction } from "@/features/dashboard/use-server-action";
import { minutesBetween, minutesByWeek, mondayOf, nextStep, studyStreak } from "./plan";
import { SESSION_HISTORY_DAYS, type LearningWorkspace, type Roadmap } from "./types";

const tooltipStyle = { background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 };
const axisTick = { fill: "var(--color-muted-foreground)", fontSize: 10 };

const hours = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`);

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="grid content-start gap-0.5 p-4">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className="tabular font-display text-xl font-semibold tracking-[-0.025em]">{value}</span>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </Card>
  );
}

/** Study time logged: this week, streak, a weekly chart and the session list. */
export function SessionsTab({ ws, onLog }: { ws: LearningWorkspace; onLog: () => void }) {
  const { run, pending } = useServerAction();
  const week = minutesBetween(ws.sessions, mondayOf(ws.today), ws.today);
  const lastWeekFrom = addDays(mondayOf(ws.today), -7);
  const lastWeek = minutesBetween(ws.sessions, lastWeekFrom, addDays(lastWeekFrom, 6));
  const streak = studyStreak(ws.sessions, ws.today);
  const weeks = minutesByWeek(ws.sessions, ws.today, 8);
  const roadmapOf = (id: string | null) => (id ? ws.roadmaps.find((r) => r.id === id) : undefined);
  const itemOf = (id: string | null) => (id ? ws.items.find((i) => i.id === id) : undefined);

  if (!ws.sessions.length) {
    return (
      <Card>
        <EmptyState icon={Timer} title="No study sessions yet" action={<button type="button" className="cursor-pointer text-[13px] underline underline-offset-2" onClick={onLog}>Log your first session</button>}>
          Log the time you spend studying or practising. It counts toward your roadmap&apos;s weekly plan and quiets that day&apos;s reminder.
        </EmptyState>
      </Card>
    );
  }

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="This week" value={hours(week)} hint={`Last week ${hours(lastWeek)}`} />
        <Stat label="Study streak" value={`${streak} ${streak === 1 ? "day" : "days"}`} hint={streak ? "Days in a row with study" : "Log today to start one"} />
        <Stat label={`Last ${SESSION_HISTORY_DAYS} days`} value={hours(ws.sessions.reduce((a, s) => a + s.minutes, 0))} hint={`${ws.sessions.length} sessions`} />
      </div>

      <Card className="grid gap-2 p-5">
        <h2 className="text-[13px] font-medium">Minutes per week</h2>
        <div className="h-44" role="img" aria-label={`Study minutes per week: ${weeks.map((w) => `week of ${formatShortDate(w.start, ws.locale)} ${w.minutes}`).join(", ")}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeks.map((w) => ({ ...w, label: formatShortDate(w.start, ws.locale) }))} margin={{ top: 6, right: 6, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="2 4" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} interval="preserveStartEnd" minTickGap={16} />
              <YAxis tickLine={false} axisLine={false} tick={axisTick} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--color-muted)" }} />
              <Bar dataKey="minutes" name="Minutes" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="grid grid-cols-[minmax(0,1fr)] gap-2 p-5">
        <h2 className="text-[13px] font-medium">Sessions</h2>
        <ul className="divide-y divide-border">
          {ws.sessions.map((s) => {
            const rm = roadmapOf(s.roadmap_id);
            const step = rm?.steps.find((x) => x.id === s.step_id);
            const item = itemOf(s.learning_item_id);
            return (
              <li key={s.id} className="flex items-start gap-3 py-2 text-[13px]">
                <span className="w-16 shrink-0 text-[12px] text-muted-foreground">{formatShortDate(s.studied_on, ws.locale)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate">{[rm?.title, step?.title, item?.title, s.page_from || s.page_to ? `p. ${s.page_from ?? "?"}–${s.page_to ?? "?"}` : null].filter(Boolean).join(" · ") || "Study"}</p>
                  {s.notes && <p className="line-clamp-2 text-[12px] text-muted-foreground">{s.notes}</p>}
                </div>
                <ProvenanceBadge source={s.source} />
                <span className="tabular shrink-0 text-muted-foreground">{s.minutes} min</span>
                <ConfirmDelete size="icon-sm" title="Delete this session?" description="Its minutes come off your weekly totals." confirmLabel="Delete" disabled={pending} onConfirm={() => run(() => deleteStudySession(s.id))} label="Delete session" />
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

export function SessionForm({ ws, roadmap, onDone, onCancel }: { ws: LearningWorkspace; roadmap: Roadmap | null; onDone: () => void; onCancel: () => void }) {
  const { v, set, setV, err, pending, submit } = useActionForm(() => {
    const up = roadmap ? nextStep(roadmap.steps) : null;
    return {
      date: ws.today,
      minutes: roadmap?.study_minutes?.toString() ?? "30",
      roadmapId: roadmap?.id ?? "",
      stepId: up?.id ?? "",
      itemId: up?.learning_item_id ?? "",
      markStepDone: false,
      notes: "",
      pageFrom: "",
      pageTo: "",
    };
  });
  const rm = ws.roadmaps.find((r) => r.id === v.roadmapId);
  const steps = rm ? [...rm.steps].sort((a, b) => a.position - b.position) : [];
  const step = steps.find((s) => s.id === v.stepId);
  const book = ws.items.find((i) => i.id === v.itemId && (i.kind === "book" || i.kind === "article"));

  return (
    <form noValidate className="grid gap-4" onSubmit={submit((x) => logStudySession(book ? x : { ...x, pageFrom: "", pageTo: "" }), onDone)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="ss-date" label="Day" error={err("date")}>
          <Input id="ss-date" type="date" max={ws.today} value={v.date} onChange={(e) => set("date", e.target.value)} aria-invalid={!!err("date")} />
        </Field>
        <Field id="ss-min" label="Minutes" error={err("minutes")}>
          <Input id="ss-min" inputMode="numeric" autoFocus value={v.minutes} onChange={(e) => set("minutes", e.target.value.replace(/\D/g, "").slice(0, 4))} aria-invalid={!!err("minutes")} />
        </Field>
      </div>
      <Field id="ss-roadmap" label="Roadmap" optional>
        <NativeSelect id="ss-roadmap" value={v.roadmapId} onChange={(e) => {
          const next = ws.roadmaps.find((r) => r.id === e.target.value);
          const up = next ? nextStep(next.steps) : null;
          setV((s) => ({ ...s, roadmapId: e.target.value, stepId: up?.id ?? "", itemId: up?.learning_item_id ?? s.itemId, markStepDone: false }));
        }}>
          <option value="">None</option>
          {ws.roadmaps.filter((r) => !r.archived_at || r.id === v.roadmapId).map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
        </NativeSelect>
      </Field>
      {rm && steps.length > 0 && (
        <Field id="ss-step" label="Step" optional>
          <NativeSelect id="ss-step" value={v.stepId} onChange={(e) => {
            const s = steps.find((x) => x.id === e.target.value);
            setV((x) => ({ ...x, stepId: e.target.value, itemId: s?.learning_item_id ?? x.itemId, markStepDone: false }));
          }}>
            <option value="">No particular step</option>
            {steps.map((s, i) => <option key={s.id} value={s.id}>{i + 1}. {s.title}{s.done_at ? " (done)" : ""}</option>)}
          </NativeSelect>
        </Field>
      )}
      {step && !step.done_at && (
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={v.markStepDone} onChange={(e) => set("markStepDone", e.target.checked)} className="size-4 accent-[var(--brand)]" />
          I finished this step
        </label>
      )}
      <Field id="ss-item" label="Book or course" optional>
        <NativeSelect id="ss-item" value={v.itemId} onChange={(e) => set("itemId", e.target.value)}>
          <option value="">None</option>
          {ws.items.filter((i) => i.status !== "dropped" || i.id === v.itemId).map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
        </NativeSelect>
      </Field>
      {book && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="ss-pfrom" label="From page" optional error={err("pageFrom")}>
            <Input id="ss-pfrom" inputMode="numeric" placeholder={book.current_page ? String(book.current_page + 1) : ""} value={v.pageFrom} onChange={(e) => set("pageFrom", e.target.value.replace(/\D/g, "").slice(0, 5))} aria-invalid={!!err("pageFrom")} />
          </Field>
          <Field id="ss-pto" label="To page" optional error={err("pageTo")}>
            <Input id="ss-pto" inputMode="numeric" placeholder={book.total_pages ? `of ${book.total_pages}` : ""} value={v.pageTo} onChange={(e) => set("pageTo", e.target.value.replace(/\D/g, "").slice(0, 5))} aria-invalid={!!err("pageTo")} />
          </Field>
        </div>
      )}
      <Field id="ss-notes" label="Notes" optional>
        <Textarea id="ss-notes" value={v.notes} maxLength={2000} className="min-h-14" placeholder="What you covered, what to pick up next" onChange={(e) => set("notes", e.target.value)} />
      </Field>
      <FormActions pending={pending} label="Log session" onCancel={onCancel} />
    </form>
  );
}
