"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, Pencil, Plus, Timer } from "lucide-react";
import { ConfirmDelete } from "@/components/data/confirm-delete";
import { EmptyState } from "@/components/data/empty-state";
import { FormActions, useActionForm } from "@/components/data/action-form";
import { ProvenanceBadge } from "@/components/data/provenance";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/clay/stat-tile";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { addDays, relativeDay } from "@/lib/dates";
import { deleteStudySession, logStudySession } from "@/server/actions/learning";
import { useServerAction } from "@/features/dashboard/use-server-action";
import { BookFile } from "@/features/learning/book-file";
import { minutesBetween, mondayOf, studyStreak } from "@/features/learning/plan";
import { LEARNING_STATUS_LABEL, type LearningItem } from "@/features/learning/types";
import { bookPercent, finishedIn, nextPage, pagesBetween, pagesIn } from "./reading";
import type { ReflectionWorkspace } from "./types";

function BookCard({ b, ws, onEdit, onLog }: { b: LearningItem; ws: ReflectionWorkspace; onEdit: () => void; onLog: () => void }) {
  const pct = bookPercent(b);
  const last = ws.reading.find((s) => s.learning_item_id === b.id);
  return (
    <li>
      <Card className="grid h-full content-start gap-2.5 p-4">
        <div className="flex items-start gap-1">
          <div className="min-w-0 flex-1">
            <p className="text-[14px] leading-snug font-medium">{b.title}</p>
            <p className="text-[12px] text-muted-foreground">{[b.author, b.kind === "article" ? "Article" : null].filter(Boolean).join(" · ") || " "}</p>
          </div>
          <ProvenanceBadge source={b.source} />
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${b.title}`} onClick={onEdit}><Pencil /></Button>
        </div>
        <div className="flex items-center gap-2 text-[12px]">
          <Progress value={pct} className="flex-1" aria-label={`${b.title}: ${pct}%`} />
          <span className="tabular text-muted-foreground">
            {b.total_pages ? `${b.status === "completed" ? b.total_pages : b.current_page ?? 0} / ${b.total_pages}` : `${pct}%`}
          </span>
        </div>
        {last && <p className="text-[11px] text-muted-foreground">Last read {relativeDay(last.studied_on, ws.today).toLowerCase()}{pagesIn(last) ? `, ${pagesIn(last)} pages` : ""}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-2">
          {b.status !== "completed" && <Button size="sm" variant="outline" onClick={onLog}><Timer /> Log reading</Button>}
          <BookFile item={b} demo={ws.demo} compact />
        </div>
      </Card>
    </li>
  );
}

/** What you're reading, the files that go with it, and your reading log. */
export function ReadingTab({ ws, onEdit, onLog }: { ws: ReflectionWorkspace; onEdit: (b: LearningItem | null) => void; onLog: (b: LearningItem | null) => void }) {
  const { run, pending } = useServerAction();
  const [showAll, setShowAll] = useState(false);
  const weekFrom = mondayOf(ws.today);
  const reading = ws.books.filter((b) => b.status === "in_progress");
  const next = ws.books.filter((b) => b.status === "planned");
  const done = ws.books.filter((b) => b.status === "completed");
  const bookOf = (id: string | null) => ws.books.find((b) => b.id === id);
  const streak = studyStreak(ws.reading, ws.today);

  if (!ws.books.length) {
    return (
      <Card>
        <EmptyState icon={BookOpen} title="No books yet" action={<Button size="sm" onClick={() => onEdit(null)}><Plus /> Add a book</Button>}>
          Add what you&apos;re reading, upload the PDF or EPUB if you have it, and log pages as you go. Books here are the same ones in <Link href="/learning" className="underline underline-offset-2">Learning</Link>.
        </EmptyState>
      </Card>
    );
  }

  const section = (title: string, list: LearningItem[]) => list.length > 0 && (
    <section className="grid grid-cols-[minmax(0,1fr)] gap-2">
      <h2 className="label-caps">{title} <span className="tabular">{list.length}</span></h2>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((b) => <BookCard key={b.id} b={b} ws={ws} onEdit={() => onEdit(b)} onLog={() => onLog(b)} />)}
      </ul>
    </section>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile tint="sand" label="Pages this week" value={String(pagesBetween(ws.reading, weekFrom, ws.today))} hint={`${minutesBetween(ws.reading, weekFrom, ws.today)} min`} />
        <StatTile tint="sage" label="Reading streak" value={`${streak} ${streak === 1 ? "day" : "days"}`} hint={streak ? "Days in a row" : "Read today to start one"} />
        <StatTile tint="clay" label="Last 30 days" value={`${pagesBetween(ws.reading, addDays(ws.today, -29), ws.today)} pages`} hint={`${minutesBetween(ws.reading, addDays(ws.today, -29), ws.today)} min`} />
        <StatTile tint="mist" label={`Finished in ${ws.today.slice(0, 4)}`} value={String(finishedIn(ws.books, ws.today.slice(0, 4)))} />
      </div>

      {section(LEARNING_STATUS_LABEL.in_progress, reading)}
      {section("Up next", next)}
      {done.length > 0 && (showAll ? section(LEARNING_STATUS_LABEL.completed, done)
        : <button type="button" className="w-fit cursor-pointer text-[12px] text-muted-foreground hover:text-foreground" onClick={() => setShowAll(true)}>Show {done.length} finished</button>)}

      <Card className="grid grid-cols-[minmax(0,1fr)] gap-2 p-5">
        <h2 className="label-caps">Reading log</h2>
        {!ws.reading.length ? <p className="text-[13px] text-muted-foreground">Nothing logged yet. Use “Log reading” on a book.</p> : (
          <ul className="divide-y divide-border">
            {ws.reading.slice(0, 40).map((s) => (
              <li key={s.id} className="flex items-start gap-3 py-2 text-[13px]">
                <span className="w-20 shrink-0 text-[12px] text-muted-foreground">{relativeDay(s.studied_on, ws.today)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate">{bookOf(s.learning_item_id)?.title ?? "Reading"}{s.page_from || s.page_to ? <span className="text-muted-foreground"> · p. {s.page_from ?? "?"}–{s.page_to ?? "?"}</span> : null}</p>
                  {s.notes && <p className="line-clamp-2 text-[12px] text-muted-foreground">{s.notes}</p>}
                </div>
                <ProvenanceBadge source={s.source} />
                <span className="tabular shrink-0 text-muted-foreground">{s.minutes} min</span>
                <ConfirmDelete size="icon-sm" title="Delete this session?" description="It comes off your totals. The page you're on stays as it is." confirmLabel="Delete" disabled={pending} onConfirm={() => run(() => deleteStudySession(s.id))} label="Delete session" />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export function ReadingForm({ ws, book, onDone, onCancel }: { ws: ReflectionWorkspace; book: LearningItem | null; onDone: () => void; onCancel: () => void }) {
  const open = ws.books.filter((b) => b.status !== "completed" && b.status !== "dropped");
  const first = book ?? open[0] ?? null;
  const { v, set, setV, err, pending, submit } = useActionForm(() => ({
    date: ws.today, minutes: "20", itemId: first?.id ?? "", roadmapId: "", stepId: "", markStepDone: false, notes: "",
    pageFrom: first ? String(nextPage(first)) : "", pageTo: "",
  }));
  const current = ws.books.find((b) => b.id === v.itemId);
  return (
    <form noValidate className="grid gap-4" onSubmit={submit(logStudySession, onDone)}>
      <Field id="rd-book" label="Book" error={err("itemId")}>
        <NativeSelect id="rd-book" value={v.itemId} onChange={(e) => {
          const b = ws.books.find((x) => x.id === e.target.value);
          setV((s) => ({ ...s, itemId: e.target.value, pageFrom: b ? String(nextPage(b)) : "", pageTo: "" }));
        }}>
          {!v.itemId && <option value="">Pick a book</option>}
          {open.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
        </NativeSelect>
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="rd-date" label="Day" error={err("date")}>
          <Input id="rd-date" type="date" max={ws.today} value={v.date} onChange={(e) => set("date", e.target.value)} aria-invalid={!!err("date")} />
        </Field>
        <Field id="rd-from" label="From page" optional error={err("pageFrom")}>
          <Input id="rd-from" inputMode="numeric" value={v.pageFrom} onChange={(e) => set("pageFrom", e.target.value.replace(/\D/g, "").slice(0, 5))} aria-invalid={!!err("pageFrom")} />
        </Field>
        <Field id="rd-to" label="To page" optional error={err("pageTo")}>
          <Input id="rd-to" inputMode="numeric" autoFocus placeholder={current?.total_pages ? `of ${current.total_pages}` : ""} value={v.pageTo} onChange={(e) => set("pageTo", e.target.value.replace(/\D/g, "").slice(0, 5))} aria-invalid={!!err("pageTo")} />
        </Field>
      </div>
      <Field id="rd-min" label="Minutes" error={err("minutes")}>
        <Input id="rd-min" inputMode="numeric" value={v.minutes} onChange={(e) => set("minutes", e.target.value.replace(/\D/g, "").slice(0, 4))} aria-invalid={!!err("minutes")} />
      </Field>
      {current?.total_pages && Number(v.pageTo) >= current.total_pages && <p className="-mt-2 text-[12px] text-muted-foreground"><Badge variant="outline">Last page</Badge> This marks the book as finished.</p>}
      <Field id="rd-notes" label="Notes" optional>
        <Textarea id="rd-notes" value={v.notes} maxLength={2000} className="min-h-14" placeholder="An idea worth keeping, a quote, a question" onChange={(e) => set("notes", e.target.value)} />
      </Field>
      <FormActions pending={pending} label="Log reading" onCancel={onCancel} />
    </form>
  );
}
