"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, CircleDot, MapPin, Plus, Repeat, TriangleAlert, X } from "lucide-react";
import { EmptyState } from "@/components/data/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { conflictIds, layoutDay, onDay, shiftAnchor, type CalendarView, type Occurrence } from "@/lib/calendar";
import { formatTime, localDateKey, weekdayOf } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { EventForm, draftFor, type EventDraft } from "./event-form";
import { KIND_LABEL, taskDayKey, type CalendarData, type CalendarEvent, type CalendarTask } from "./types";

type Occ = Occurrence<CalendarEvent>;

const VIEWS: { v: CalendarView; label: string }[] = [
  { v: "day", label: "Day" },
  { v: "week", label: "Week" },
  { v: "month", label: "Month" },
  { v: "agenda", label: "Agenda" },
];

const KIND_COLOR: Record<CalendarEvent["kind"], string> = {
  event: "var(--chart-1)",
  meeting: "var(--chart-4)",
  appointment: "var(--chart-2)",
  time_block: "var(--chart-3)",
  reminder_only: "var(--chart-5)",
};

const HOUR_PX = 48;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function fmtDay(key: string, locale: string, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...opts }).format(new Date(`${key}T12:00:00Z`));
}

function title(d: CalendarData) {
  if (d.view === "day") return fmtDay(d.date, d.locale, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  if (d.view === "month") return fmtDay(d.date, d.locale, { month: "long", year: "numeric" });
  const a = fmtDay(d.from, d.locale, { month: "short", day: "numeric" });
  const b = fmtDay(d.to, d.locale, { month: "short", day: "numeric", year: "numeric" });
  return `${a} – ${b}`;
}

function eventStyle(kind: CalendarEvent["kind"]): React.CSSProperties {
  return { ["--ev" as string]: KIND_COLOR[kind] };
}

export function CalendarScreen({ data, nowIso, startNew = false }: { data: CalendarData; nowIso: string; startNew?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const tz = data.timezone;
  const [editing, setEditing] = useState<{ event: CalendarEvent | null; draft?: EventDraft } | null>(startNew ? { event: null, draft: draftFor(data.date) } : null);
  const blockTask = data.blockTask;

  const href = (view: CalendarView, date: string, keepBlock = true) =>
    `${pathname}?view=${view}&date=${date}${keepBlock && blockTask ? `&block=${blockTask.id}` : ""}`;
  const go = (view: CalendarView, date: string) => router.push(href(view, date), { scroll: false });

  const conflicts = useMemo(() => {
    const ids = new Set<string>();
    for (const day of data.days) for (const id of conflictIds(onDay(data.occurrences, day, tz))) ids.add(id);
    return ids;
  }, [data.days, data.occurrences, tz]);

  const tasksByDay = useMemo(() => {
    const m = new Map<string, CalendarTask[]>();
    for (const t of data.tasks) {
      const k = taskDayKey(t, tz);
      if (k) m.set(k, [...(m.get(k) ?? []), t]);
    }
    return m;
  }, [data.tasks, tz]);

  useEffect(() => {
    const onNew = () => setEditing({ event: null, draft: draftFor(data.date === data.today ? data.today : data.date) });
    window.addEventListener("lifeos:new-event", onNew);
    return () => window.removeEventListener("lifeos:new-event", onNew);
  }, [data.date, data.today]);

  // Keyboard: t = today, ←/→ = previous/next, d/w/m/a = view.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || el.closest("input, textarea, select, [contenteditable], [role=dialog]")) return;
      const map: Record<string, CalendarView> = { d: "day", w: "week", m: "month", a: "agenda" };
      if (e.key === "t") go(data.view, data.today);
      else if (e.key === "ArrowLeft") go(data.view, shiftAnchor(data.view, data.date, -1));
      else if (e.key === "ArrowRight") go(data.view, shiftAnchor(data.view, data.date, 1));
      else if (map[e.key]) go(map[e.key], data.date);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const openSlot = (date: string, time: string) => {
    if (blockTask) {
      setEditing({
        event: null,
        draft: draftFor(date, time, blockTask.estimate_minutes ?? 60, { title: blockTask.title, kind: "time_block", taskId: blockTask.id }),
      });
    } else setEditing({ event: null, draft: draftFor(date, time) });
  };
  const openEvent = (o: Occ) => {
    // Edit the stored event: for a repeat that's the whole series, so show its own start.
    const { eventId, occurrenceDate: _d, recurring: _r, series_starts_at, series_ends_at, ...rest } = o;
    setEditing({ event: { ...rest, id: eventId, starts_at: series_starts_at, ends_at: series_ends_at } });
  };

  return (
    <div className="grid gap-4">
      {blockTask && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-brand/40 bg-accent/50 px-4 py-3 text-[13px]">
          <CircleDot className="size-4 text-brand" aria-hidden />
          <span className="flex-1">
            Pick a time to work on <span className="font-medium">{blockTask.title}</span>
            {blockTask.estimate_minutes ? ` (${blockTask.estimate_minutes} min estimate)` : ""}. Click an empty slot, or
          </span>
          <Button size="sm" onClick={() => openSlot(data.view === "day" ? data.date : data.today, "09:00")}>Choose a time</Button>
          <Button variant="ghost" size="icon-sm" aria-label="Stop blocking time" asChild>
            <Link href={href(data.view, data.date, false)}><X /></Link>
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" aria-label="Previous" onClick={() => go(data.view, shiftAnchor(data.view, data.date, -1))}><ChevronLeft /></Button>
          <Button variant="outline" size="sm" onClick={() => go(data.view, data.today)}>Today</Button>
          <Button variant="outline" size="icon-sm" aria-label="Next" onClick={() => go(data.view, shiftAnchor(data.view, data.date, 1))}><ChevronRight /></Button>
        </div>
        <h2 className="text-[15px] font-medium tracking-tight">{title(data)}</h2>
        <div role="tablist" aria-label="Calendar view" className="ml-auto flex rounded-md bg-muted p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.v}
              role="tab"
              aria-selected={data.view === v.v}
              onClick={() => go(v.v, data.date)}
              className={cn("h-7 cursor-pointer rounded px-3 text-[13px] text-muted-foreground", data.view === v.v && "bg-surface font-medium text-foreground shadow-[var(--shadow-card)]")}
            >
              {v.label}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={() => openSlot(data.view === "day" ? data.date : data.today, "09:00")}><Plus /> New event</Button>
      </div>

      {(data.view === "day" || data.view === "week") && (
        <TimeGrid data={data} nowIso={nowIso} conflicts={conflicts} tasksByDay={tasksByDay} onSlot={openSlot} onEvent={openEvent} dayHref={(k) => href("day", k)} />
      )}
      {data.view === "month" && <MonthGrid data={data} conflicts={conflicts} tasksByDay={tasksByDay} onEvent={openEvent} dayHref={(k) => href("day", k)} />}
      {data.view === "agenda" && <Agenda data={data} conflicts={conflicts} tasksByDay={tasksByDay} onEvent={openEvent} dayHref={(k) => href("day", k)} onNew={() => openSlot(data.today, "09:00")} />}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.event ? (editing.event.external_provider ? editing.event.title : "Edit event") : editing?.draft?.kind === "time_block" ? "Block time" : "New event"}</DialogTitle>
            <DialogDescription className="sr-only">Event details</DialogDescription>
          </DialogHeader>
          {editing && (
            <EventForm
              key={editing.event?.id ?? "new"}
              event={editing.event}
              draft={editing.draft}
              tz={tz}
              taskTitle={!editing.event && editing.draft?.taskId ? blockTask?.title : undefined}
              onCancel={() => setEditing(null)}
              onDone={() => {
                const wasBlock = !editing.event && !!editing.draft?.taskId;
                setEditing(null);
                if (wasBlock) router.replace(href(data.view, data.date, false), { scroll: false });
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function EventChip({ o, conflict, tz, locale, onClick, compact }: { o: Occ; conflict: boolean; tz: string; locale: string; onClick: () => void; compact?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={eventStyle(o.kind)}
      className={cn(
        "flex w-full min-w-0 cursor-pointer items-center gap-1.5 truncate rounded px-1.5 text-left text-[12px] leading-5",
        o.all_day ? "bg-[color-mix(in_oklch,var(--ev)_22%,var(--surface))]" : "hover:bg-muted",
        conflict && "ring-1 ring-warning",
      )}
      title={`${o.title}${o.all_day ? "" : ` · ${formatTime(o.starts_at, tz, locale)}`}`}
    >
      {!o.all_day && <span className="size-1.5 shrink-0 rounded-full bg-[var(--ev)]" aria-hidden />}
      {!o.all_day && !compact && <span className="tabular shrink-0 text-muted-foreground">{formatTime(o.starts_at, tz, locale)}</span>}
      <span className="truncate">{o.title}</span>
      {o.source === "sample" && <span className="sr-only">(sample)</span>}
    </button>
  );
}

function TaskChip({ t }: { t: CalendarTask }) {
  return (
    <Link href={`/tasks?view=all&open=${t.id}`} className="flex min-w-0 items-center gap-1.5 truncate rounded px-1.5 text-[12px] leading-5 text-muted-foreground hover:bg-muted hover:text-foreground">
      <span className="size-2.5 shrink-0 rounded-[3px] border border-current" aria-hidden />
      <span className="truncate">{t.title}</span>
    </Link>
  );
}

function TimeGrid({
  data, nowIso, conflicts, tasksByDay, onSlot, onEvent, dayHref,
}: {
  data: CalendarData; nowIso: string; conflicts: Set<string>; tasksByDay: Map<string, CalendarTask[]>;
  onSlot: (date: string, time: string) => void; onEvent: (o: Occ) => void; dayHref: (k: string) => string;
}) {
  const tz = data.timezone;
  const scroller = useRef<HTMLDivElement>(null);
  const now = new Date(nowIso);
  const nowKey = localDateKey(now, tz);
  const [nh, nm] = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now).split(":").map(Number);
  const nowMin = nh * 60 + nm;

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 7 * HOUR_PX;
  }, [data.view, data.date]);

  const cols = data.days;
  const allDay = cols.map((k) => onDay(data.occurrences, k, tz).filter((o) => o.all_day));
  const hasTop = allDay.some((a) => a.length) || cols.some((k) => tasksByDay.get(k)?.length);
  const gridCols = { gridTemplateColumns: `3.5rem repeat(${cols.length}, minmax(0, 1fr))` };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-card)]">
      <div className="grid border-b border-border" style={gridCols}>
        <div />
        {cols.map((k) => (
          <Link key={k} href={dayHref(k)} className={cn("border-l border-border px-2 py-2 text-center text-[12px] text-muted-foreground hover:bg-muted", k === data.today && "text-brand")}>
            <span className="block">{fmtDay(k, data.locale, { weekday: "short" })}</span>
            <span className={cn("tabular text-[17px] font-medium text-foreground", k === data.today && "text-brand")}>{Number(k.slice(8))}</span>
          </Link>
        ))}
      </div>
      {hasTop && (
        <div className="grid border-b border-border" style={gridCols}>
          <div className="px-1 py-1.5 text-right text-[10px] text-subtle-foreground">all day</div>
          {cols.map((k, i) => (
            <div key={k} className="grid min-w-0 content-start gap-0.5 border-l border-border p-1">
              {allDay[i].map((o) => <EventChip key={o.id} o={o} conflict={false} tz={tz} locale={data.locale} onClick={() => onEvent(o)} />)}
              {(tasksByDay.get(k) ?? []).slice(0, data.view === "day" ? 20 : 3).map((t) => <TaskChip key={t.id} t={t} />)}
              {data.view === "week" && (tasksByDay.get(k)?.length ?? 0) > 3 && (
                <Link href={dayHref(k)} className="px-1.5 text-[11px] text-muted-foreground hover:text-foreground">+{tasksByDay.get(k)!.length - 3} tasks</Link>
              )}
            </div>
          ))}
        </div>
      )}
      <div ref={scroller} className="max-h-[min(70vh,44rem)] overflow-y-auto">
        <div className="relative grid" style={{ ...gridCols, height: 24 * HOUR_PX }}>
          <div className="relative">
            {Array.from({ length: 23 }, (_, h) => (
              <span key={h} className="tabular absolute right-2 -translate-y-1/2 text-[10px] text-subtle-foreground" style={{ top: (h + 1) * HOUR_PX }}>
                {String(h + 1).padStart(2, "0")}:00
              </span>
            ))}
          </div>
          {cols.map((k) => {
            const timed = onDay(data.occurrences, k, tz).filter((o) => !o.all_day);
            const layout = layoutDay(timed, k, tz);
            return (
              <div key={k} className="relative border-l border-border" aria-label={fmtDay(k, data.locale, { weekday: "long", month: "long", day: "numeric" })}>
                {Array.from({ length: 48 }, (_, s) => (
                  <button
                    key={s}
                    aria-label={`New event ${fmtDay(k, data.locale, { weekday: "short", day: "numeric" })} ${String(Math.floor(s / 2)).padStart(2, "0")}:${s % 2 ? "30" : "00"}`}
                    tabIndex={-1}
                    onClick={() => onSlot(k, `${String(Math.floor(s / 2)).padStart(2, "0")}:${s % 2 ? "30" : "00"}`)}
                    className={cn("absolute inset-x-0 cursor-pointer hover:bg-muted/70", s % 2 === 0 && s > 0 && "border-t border-border/70")}
                    style={{ top: (s * HOUR_PX) / 2, height: HOUR_PX / 2 }}
                  />
                ))}
                {timed.map((o) => {
                  const l = layout.get(o.id);
                  if (!l) return null;
                  const conflict = conflicts.has(o.id);
                  const height = ((l.bottom - l.top) / 60) * HOUR_PX;
                  return (
                    <button
                      key={o.id}
                      onClick={() => onEvent(o)}
                      style={{ ...eventStyle(o.kind), top: (l.top / 60) * HOUR_PX + 1, height: height - 2, left: `calc(${(l.col / l.cols) * 100}% + 2px)`, width: `calc(${100 / l.cols}% - 4px)` }}
                      className={cn(
                        "absolute cursor-pointer overflow-hidden rounded-md border-l-[3px] border-[var(--ev)] bg-[color-mix(in_oklch,var(--ev)_14%,var(--surface))] px-1.5 py-0.5 text-left text-[12px] leading-4 hover:bg-[color-mix(in_oklch,var(--ev)_22%,var(--surface))]",
                        o.kind === "time_block" && "border-dashed",
                        o.source === "sample" && "outline-1 outline-dashed outline-warning/60",
                        conflict && "ring-1 ring-warning",
                      )}
                    >
                      <span className="flex items-center gap-1 font-medium">
                        {conflict && <TriangleAlert className="size-3 shrink-0 text-warning" aria-label="Overlaps another event" />}
                        <span className="truncate">{o.title}</span>
                        {o.recurring && <Repeat className="size-3 shrink-0 text-muted-foreground" aria-label="Repeats" />}
                      </span>
                      {height > 30 && (
                        <span className="tabular block truncate text-[11px] text-muted-foreground">
                          {formatTime(o.starts_at, tz, data.locale)}–{formatTime(o.ends_at, tz, data.locale)}
                          {o.location ? ` · ${o.location}` : ""}
                        </span>
                      )}
                    </button>
                  );
                })}
                {k === nowKey && (
                  <div className="pointer-events-none absolute inset-x-0 z-10 h-px bg-destructive" style={{ top: (nowMin / 60) * HOUR_PX }} aria-hidden>
                    <span className="absolute -top-1 -left-1 size-2 rounded-full bg-destructive" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MonthGrid({
  data, conflicts, tasksByDay, onEvent, dayHref,
}: { data: CalendarData; conflicts: Set<string>; tasksByDay: Map<string, CalendarTask[]>; onEvent: (o: Occ) => void; dayHref: (k: string) => string }) {
  const tz = data.timezone;
  const month = data.date.slice(0, 7);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-card)]">
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAYS.map((d) => <div key={d} className="px-2 py-2 text-[11px] font-medium text-muted-foreground">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {data.days.map((k) => {
          const occ = onDay(data.occurrences, k, tz);
          const tasks = tasksByDay.get(k) ?? [];
          const shown = occ.slice(0, 3);
          const more = occ.length - shown.length + Math.max(0, tasks.length - (shown.length < 3 ? 3 - shown.length : 0));
          return (
            <div key={k} className={cn("min-h-24 min-w-0 border-b border-l border-border p-1 first:border-l-0 [&:nth-child(7n+1)]:border-l-0", k.slice(0, 7) !== month && "bg-muted/40", weekdayOf(k) === 0 && "")}>
              <Link href={dayHref(k)} className={cn("tabular mb-0.5 inline-flex size-6 items-center justify-center rounded-full text-[12px] hover:bg-muted", k === data.today && "bg-primary text-primary-foreground hover:bg-primary", k.slice(0, 7) !== month && "text-subtle-foreground")}>
                {Number(k.slice(8))}
              </Link>
              <div className="grid gap-0.5">
                {shown.map((o) => <EventChip key={o.id} o={o} compact conflict={conflicts.has(o.id)} tz={tz} locale={data.locale} onClick={() => onEvent(o)} />)}
                {shown.length < 3 && tasks.slice(0, 3 - shown.length).map((t) => <TaskChip key={t.id} t={t} />)}
                {more > 0 && <Link href={dayHref(k)} className="px-1.5 text-[11px] text-muted-foreground hover:text-foreground">+{more} more</Link>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Agenda({
  data, conflicts, tasksByDay, onEvent, dayHref, onNew,
}: { data: CalendarData; conflicts: Set<string>; tasksByDay: Map<string, CalendarTask[]>; onEvent: (o: Occ) => void; dayHref: (k: string) => string; onNew: () => void }) {
  const tz = data.timezone;
  const days = data.days.filter((k) => onDay(data.occurrences, k, tz).length || tasksByDay.get(k)?.length);
  if (!days.length) {
    return (
      <EmptyState
        title="Nothing scheduled in the next 30 days"
        action={<Button size="sm" onClick={onNew}><Plus /> New event</Button>}
      >
        Add an event, or block time for a task from the Tasks screen.
      </EmptyState>
    );
  }
  return (
    <div className="grid gap-5">
      {days.map((k) => (
        <section key={k} aria-label={fmtDay(k, data.locale, { weekday: "long", month: "long", day: "numeric" })} className="grid gap-1.5 sm:grid-cols-[9rem_1fr]">
          <Link href={dayHref(k)} className={cn("text-[13px] font-medium hover:underline", k === data.today && "text-brand")}>
            {k === data.today ? "Today" : fmtDay(k, data.locale, { weekday: "short", month: "short", day: "numeric" })}
          </Link>
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {onDay(data.occurrences, k, tz).map((o) => (
              <li key={o.id}>
                <button onClick={() => onEvent(o)} style={eventStyle(o.kind)} className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left text-[13px] hover:bg-muted/60">
                  <span className="h-8 w-1 shrink-0 rounded-full bg-[var(--ev)]" aria-hidden />
                  <span className="tabular w-24 shrink-0 text-[12px] text-muted-foreground">
                    {o.all_day ? "All day" : `${formatTime(o.starts_at, tz, data.locale)}–${formatTime(o.ends_at, tz, data.locale)}`}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 truncate font-medium">
                      {o.title}
                      {o.recurring && <Repeat className="size-3 text-muted-foreground" aria-label="Repeats" />}
                    </span>
                    {o.location && <span className="flex items-center gap-1 truncate text-[12px] text-muted-foreground"><MapPin className="size-3" aria-hidden /> {o.location}</span>}
                  </span>
                  {conflicts.has(o.id) && <Badge variant="warning"><TriangleAlert /> Overlaps</Badge>}
                  {o.source === "sample" && <Badge variant="sample">Sample</Badge>}
                  <span className="hidden text-[11px] text-subtle-foreground sm:inline">{KIND_LABEL[o.kind]}</span>
                </button>
              </li>
            ))}
            {(tasksByDay.get(k) ?? []).map((t) => (
              <li key={t.id} className="px-3 py-2 text-[13px]">
                <Link href={`/tasks?view=all&open=${t.id}`} className="flex items-center gap-3 text-muted-foreground hover:text-foreground">
                  <span className="h-8 w-1 shrink-0" aria-hidden />
                  <span className="w-24 shrink-0 text-[12px]">{t.due_at ? formatTime(t.due_at, tz, data.locale) : "Task due"}</span>
                  <span className="size-3 shrink-0 rounded-[3px] border border-current" aria-hidden />
                  <span className="truncate">{t.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
