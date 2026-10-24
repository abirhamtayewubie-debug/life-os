"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, ClipboardList, Pencil, Plus, X } from "lucide-react";
import { ConfirmDelete } from "@/components/data/confirm-delete";
import { EmptyState } from "@/components/data/empty-state";
import { FormActions, useActionForm } from "@/components/data/action-form";
import { ProvenanceBadge } from "@/components/data/provenance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { formatShortDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { deleteReview, savePeriodReview } from "@/server/actions/reflection";
import { useServerAction } from "@/features/dashboard/use-server-action";
import { practiceMinutes } from "./meditation";
import { periodLabel, periodOf, recentPeriods, reviewFor, suggestedPeriod, type Period, type PeriodKind } from "./reviews";
import type { ReflectionWorkspace, Review, ReviewKind } from "./types";

const SCALE = ["Very low", "Low", "Okay", "Good", "Very good"];
const KIND_LABEL: Record<ReviewKind, string> = { morning: "Morning", evening: "Evening", weekly: "Weekly", monthly: "Monthly" };
const NEXT: Record<PeriodKind, string> = { weekly: "next week", monthly: "next month" };

export type ReviewTarget = { kind: PeriodKind; period: Period };

/** What the period holds in Reflection itself; the full picture is in Reports. */
function PeriodFacts({ ws, p }: { ws: ReflectionWorkspace; p: Period }) {
  const to = p.end < ws.today ? p.end : ws.today;
  const journalDays = new Set(ws.entries.filter((e) => e.entry_date >= p.start && e.entry_date <= to).map((e) => e.entry_date)).size;
  const med = practiceMinutes(ws.practice, p.start, to);
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
      <span>{journalDays} {journalDays === 1 ? "day" : "days"} journaled</span>
      <span>{med} min meditation</span>
      <Link href={`/reports?period=${p.kind}&date=${p.start}`} className="text-foreground underline underline-offset-2">Open the {p.kind === "weekly" ? "week" : "month"}&apos;s report</Link>
    </p>
  );
}

export function ReviewsTab({ ws, onWrite }: { ws: ReflectionWorkspace; onWrite: (t: ReviewTarget) => void }) {
  const { run, pending } = useServerAction();
  const [filter, setFilter] = useState<ReviewKind | "all">("all");
  const shown = ws.reviews.filter((r) => filter === "all" || r.kind === filter);
  const kinds = (["weekly", "monthly", "evening", "morning"] as ReviewKind[]).filter((k) => ws.reviews.some((r) => r.kind === k));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
        {(["weekly", "monthly"] as PeriodKind[]).map((kind) => {
          const p = suggestedPeriod(kind, ws.reviews, ws.today, ws.weekStart);
          const done = reviewFor(ws.reviews, p);
          const current = periodOf(kind, ws.today, ws.weekStart).start === p.start;
          return (
            <Card key={kind} className="grid content-start gap-2 p-5">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <h2 className="text-[13px] font-medium">{current ? (kind === "weekly" ? "This week" : "This month") : (kind === "weekly" ? "Last week" : "Last month")}</h2>
                  <p className="text-[12px] text-muted-foreground">{periodLabel(p, ws.locale)}</p>
                </div>
                {done ? <Badge variant="outline"><CheckCircle2 className="size-3 text-emerald-600" aria-hidden /> Reviewed</Badge> : <Badge variant="outline">Not reviewed yet</Badge>}
              </div>
              <PeriodFacts ws={ws} p={p} />
              <Button size="sm" variant={done ? "outline" : "default"} className="w-fit" onClick={() => onWrite({ kind, period: p })}>
                {done ? <><Pencil /> Edit review</> : <><Plus /> Write the {kind} review</>}
              </Button>
            </Card>
          );
        })}
      </div>

      <section aria-labelledby="rev-history" className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="rev-history" className="text-[13px] font-medium">Past reviews</h2>
          {kinds.length > 1 && (
            <div role="tablist" aria-label="Review type" className="ml-auto flex rounded-md bg-muted p-0.5">
              {(["all", ...kinds] as const).map((k) => (
                <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={cn("h-7 cursor-pointer rounded px-3 text-[12px] text-muted-foreground", filter === k && "bg-surface font-medium text-foreground shadow-card")}>
                  {k === "all" ? "All" : KIND_LABEL[k]}
                </button>
              ))}
            </div>
          )}
        </div>
        {!shown.length ? (
          <Card>
            <EmptyState icon={ClipboardList} title="No reviews yet">
              A weekly review takes ten minutes: what went well, what didn&apos;t, and what to focus on next. Evening reviews from Today show up here too.
            </EmptyState>
          </Card>
        ) : (
          <ul className="grid gap-2">
            {shown.map((r) => <ReviewCard key={r.id} r={r} ws={ws} pending={pending} onEdit={r.kind === "weekly" || r.kind === "monthly" ? () => onWrite({ kind: r.kind as PeriodKind, period: periodOf(r.kind as PeriodKind, r.review_date, ws.weekStart) }) : null} onDelete={() => run(() => deleteReview(r.id))} />)}
          </ul>
        )}
      </section>
    </div>
  );
}

function ReviewCard({ r, ws, pending, onEdit, onDelete }: { r: Review; ws: ReflectionWorkspace; pending: boolean; onEdit: (() => void) | null; onDelete: () => void }) {
  const title = r.kind === "weekly" || r.kind === "monthly" ? periodLabel(periodOf(r.kind, r.review_date, ws.weekStart), ws.locale) : formatShortDate(r.review_date, ws.locale);
  const next = r.kind === "weekly" ? "Focus next week" : r.kind === "monthly" ? "Focus next month" : "Priorities for the next day";
  return (
    <li>
      <Card className="grid gap-2 p-4">
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
          <span className="text-[13px] font-medium text-foreground">{title}</span>
          <Badge variant="outline">{KIND_LABEL[r.kind]}</Badge>
          {r.mood && <span>Mood: {SCALE[r.mood - 1]}</span>}
          {r.energy && <span>Energy: {SCALE[r.energy - 1]}</span>}
          <ProvenanceBadge source={r.source} />
          <div className="ml-auto flex gap-1">
            {onEdit && <Button variant="ghost" size="icon-sm" aria-label="Edit review" onClick={onEdit}><Pencil /></Button>}
            <ConfirmDelete size="icon-sm" label="Delete review" disabled={pending} title="Delete this review?" description="It will be removed permanently." confirmLabel="Delete" onConfirm={onDelete} />
          </div>
        </div>
        <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
          {r.achievements && <div><dt className="text-[11px] text-muted-foreground">What went well</dt><dd className="whitespace-pre-wrap">{r.achievements}</dd></div>}
          {r.unfinished && <div><dt className="text-[11px] text-muted-foreground">What didn&apos;t go to plan</dt><dd className="whitespace-pre-wrap">{r.unfinished}</dd></div>}
          {r.tomorrow_priorities.length > 0 && (
            <div><dt className="text-[11px] text-muted-foreground">{next}</dt><dd><ul className="list-disc pl-4">{r.tomorrow_priorities.map((p, i) => <li key={i}>{p}</li>)}</ul></dd></div>
          )}
          {r.notes && <div><dt className="text-[11px] text-muted-foreground">Lessons</dt><dd className="whitespace-pre-wrap">{r.notes}</dd></div>}
        </dl>
      </Card>
    </li>
  );
}

export function PeriodReviewForm({ ws, target, onDone, onCancel }: { ws: ReflectionWorkspace; target: ReviewTarget; onDone: () => void; onCancel: () => void }) {
  const periods = recentPeriods(target.kind, ws.today, ws.weekStart, 6);
  if (!periods.some((p) => p.start === target.period.start)) periods.push(target.period);
  const initial = (p: Period) => {
    const r = reviewFor(ws.reviews, p);
    return {
      kind: target.kind, date: p.start, achievements: r?.achievements ?? "", unfinished: r?.unfinished ?? "",
      priorities: r?.tomorrow_priorities.length ? [...r.tomorrow_priorities] : ["", "", ""],
      mood: r?.mood?.toString() ?? "", energy: r?.energy?.toString() ?? "", notes: r?.notes ?? "",
    };
  };
  const { v, set, setV, err, pending, submit } = useActionForm(() => initial(target.period));
  const period = periods.find((p) => p.start === v.date) ?? target.period;
  const setPriority = (i: number, s: string) => set("priorities", v.priorities.map((x, j) => (j === i ? s : x)));

  return (
    <form noValidate className="grid gap-4" onSubmit={submit(savePeriodReview, onDone)}>
      <Field id="rv-period" label={target.kind === "weekly" ? "Week" : "Month"}>
        <NativeSelect id="rv-period" value={v.date} onChange={(e) => { const p = periods.find((x) => x.start === e.target.value); if (p) setV(initial(p)); }}>
          {periods.map((p) => <option key={p.start} value={p.start}>{periodLabel(p, ws.locale)}{reviewFor(ws.reviews, p) ? " (reviewed)" : ""}</option>)}
        </NativeSelect>
      </Field>
      <div className="rounded-xl border border-border bg-muted/40 px-3 py-2"><PeriodFacts ws={ws} p={period} /></div>
      <Field id="rv-wins" label="What went well?" optional>
        <Textarea id="rv-wins" autoFocus value={v.achievements} maxLength={5000} className="min-h-16" onChange={(e) => set("achievements", e.target.value)} />
      </Field>
      <Field id="rv-miss" label="What didn't go to plan?" optional>
        <Textarea id="rv-miss" value={v.unfinished} maxLength={5000} className="min-h-14" onChange={(e) => set("unfinished", e.target.value)} />
      </Field>
      <fieldset className="grid gap-1.5">
        <legend className="mb-1 text-[13px] font-medium">Focus for {NEXT[target.kind]} <span className="font-normal text-muted-foreground">(optional)</span></legend>
        {v.priorities.map((p, i) => (
          <div key={i} className="flex gap-1.5">
            <Input aria-label={`Focus ${i + 1}`} value={p} maxLength={200} className="h-8" onChange={(e) => setPriority(i, e.target.value)} />
            {v.priorities.length > 1 && <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove focus ${i + 1}`} onClick={() => set("priorities", v.priorities.filter((_, j) => j !== i))}><X /></Button>}
          </div>
        ))}
        {v.priorities.length < 5 && <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => set("priorities", [...v.priorities, ""])}><Plus /> Add</Button>}
      </fieldset>
      <Field id="rv-notes" label="Lessons to keep" optional>
        <Textarea id="rv-notes" value={v.notes} maxLength={5000} className="min-h-14" onChange={(e) => set("notes", e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="rv-mood" label="Mood overall" optional>
          <NativeSelect id="rv-mood" value={v.mood} onChange={(e) => set("mood", e.target.value)}>
            <option value="">Not set</option>
            {SCALE.map((l, i) => <option key={l} value={i + 1}>{l}</option>)}
          </NativeSelect>
        </Field>
        <Field id="rv-energy" label="Energy overall" optional>
          <NativeSelect id="rv-energy" value={v.energy} onChange={(e) => set("energy", e.target.value)}>
            <option value="">Not set</option>
            {SCALE.map((l, i) => <option key={l} value={i + 1}>{l}</option>)}
          </NativeSelect>
        </Field>
      </div>
      {err("priorities") && <p className="text-xs text-destructive">{err("priorities")}</p>}
      <FormActions pending={pending} label="Save review" onCancel={onCancel} />
    </form>
  );
}
