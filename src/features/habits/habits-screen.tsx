"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, ArchiveRestore, Check, Flame, MoreHorizontal, Pause, Pencil, Play, Plus, Repeat, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/data/empty-state";
import { ProvenanceBadge } from "@/components/data/provenance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatShortDate, localDateKey } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { deleteHabit, logHabit, setHabitArchived, setHabitPaused } from "@/server/actions/habits";
import { useServerAction } from "@/features/dashboard/use-server-action";
import { HabitForm } from "./habit-form";
import { habitStats, type HabitStats } from "./stats";
import { DAY_SHORT, TIME_OF_DAY_LABEL, type HabitRecord, type HabitWorkspace } from "./types";

const ORDER = ["morning", "afternoon", "evening", "anytime"] as const;

function scheduleText(h: HabitRecord) {
  if (h.cadence === "weekly") return `${h.target_per_period}× a week`;
  const d = [...h.schedule_days].sort();
  const per = h.target_per_period > 1 ? `${h.target_per_period}× ` : "";
  if (d.length === 7) return `${per}every day`;
  if (d.length === 5 && !d.includes(0) && !d.includes(6)) return `${per}weekdays`;
  return `${per}${[1, 2, 3, 4, 5, 6, 0].filter((x) => d.includes(x)).map((x) => DAY_SHORT[x]).join(", ")}`;
}

export function HabitsScreen({ ws, startNew = false }: { ws: HabitWorkspace; startNew?: boolean }) {
  const [editing, setEditing] = useState<HabitRecord | "new" | null>(startNew ? "new" : null);
  const [deleting, setDeleting] = useState<HabitRecord | null>(null);
  const { pending, run } = useServerAction();
  const tz = ws.timezone;

  useEffect(() => {
    const onNew = () => setEditing("new");
    window.addEventListener("lifeos:new-habit", onNew);
    return () => window.removeEventListener("lifeos:new-habit", onNew);
  }, []);

  const stats = useMemo(() => {
    const m = new Map<string, HabitStats>();
    for (const h of ws.habits) m.set(h.id, habitStats(h, ws.logs, ws.today, tz, localDateKey(new Date(h.created_at), tz)));
    return m;
  }, [ws, tz]);

  const active = ws.habits.filter((h) => !h.archived_at && !h.paused_at);
  const paused = ws.habits.filter((h) => !h.archived_at && h.paused_at);
  const archived = ws.habits.filter((h) => h.archived_at);
  const dueToday = active.filter((h) => stats.get(h.id)!.scheduledToday && h.cadence === "daily");
  const doneToday = dueToday.filter((h) => stats.get(h.id)!.doneToday);

  const card = (h: HabitRecord) => (
    <HabitCard
      key={h.id}
      h={h}
      s={stats.get(h.id)!}
      ws={ws}
      pending={pending}
      onLog={(date, count) => run(() => logHabit(h.id, date, count), { quiet: true })}
      onEdit={() => setEditing(h)}
      onPause={(p) => run(() => setHabitPaused(h.id, p))}
      onArchive={(a) => run(() => setHabitArchived(h.id, a))}
      onDelete={() => setDeleting(h)}
    />
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <div className="flex flex-wrap items-center gap-3">
        {dueToday.length > 0 ? (
          <p className="text-[13px] text-muted-foreground">
            <span className="tabular font-medium text-foreground">{doneToday.length} of {dueToday.length}</span> done today
          </p>
        ) : (
          <p className="text-[13px] text-muted-foreground">{active.length ? "Nothing scheduled today." : ""}</p>
        )}
        <Button size="sm" className="ml-auto" onClick={() => setEditing("new")}><Plus /> New habit</Button>
      </div>

      {ws.habits.length === 0 && (
        <Card>
          <EmptyState icon={Repeat} title="No habits yet" action={<Button size="sm" onClick={() => setEditing("new")}><Plus /> Add your first habit</Button>}>
            Start with one small thing you want to do regularly. You&apos;ll see streaks and consistency once you log a few days.
          </EmptyState>
        </Card>
      )}

      {ORDER.map((t) => {
        const group = active.filter((h) => (h.time_of_day ?? "anytime") === t);
        if (!group.length) return null;
        return (
          <section key={t} aria-label={TIME_OF_DAY_LABEL[t]} className="grid gap-2">
            <h2 className="text-[11px] font-medium tracking-wide text-subtle-foreground uppercase">{TIME_OF_DAY_LABEL[t]}</h2>
            <div className="grid gap-3 lg:grid-cols-2">{group.map(card)}</div>
          </section>
        );
      })}

      {paused.length > 0 && (
        <section aria-label="Paused" className="grid gap-2">
          <h2 className="text-[11px] font-medium tracking-wide text-subtle-foreground uppercase">Paused</h2>
          <div className="grid gap-3 lg:grid-cols-2">{paused.map(card)}</div>
        </section>
      )}

      {archived.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-[13px] text-muted-foreground hover:text-foreground">Archived ({archived.length})</summary>
          <ul className="mt-2 divide-y divide-border rounded-lg border border-border bg-surface">
            {archived.map((h) => (
              <li key={h.id} className="flex items-center gap-2 px-3 py-2 text-[13px]">
                <span className="flex-1 truncate">{h.name}</span>
                <Button variant="ghost" size="sm" onClick={() => run(() => setHabitArchived(h.id, false))}><ArchiveRestore /> Restore</Button>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleting(h)}><Trash2 /> Delete</Button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "New habit" : "Edit habit"}</DialogTitle>
            <DialogDescription className="sr-only">Habit details</DialogDescription>
          </DialogHeader>
          {editing && <HabitForm habit={editing === "new" ? null : editing} onDone={() => setEditing(null)} onCancel={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes the habit and every day you&apos;ve logged for it. To stop tracking but keep the history, archive it instead.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && run(() => deleteHabit(deleting.id), { onSuccess: () => setDeleting(null) })}>Delete habit</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function HabitCard({
  h, s, ws, pending, onLog, onEdit, onPause, onArchive, onDelete,
}: {
  h: HabitRecord; s: HabitStats; ws: HabitWorkspace; pending: boolean;
  onLog: (date: string, count: number) => void; onEdit: () => void; onPause: (p: boolean) => void; onArchive: (a: boolean) => void; onDelete: () => void;
}) {
  const isPaused = !!h.paused_at;
  const dailyTarget = h.cadence === "daily" ? h.target_per_period : 1;
  const countOn = (k: string) => ws.logs.filter((l) => l.habit_id === h.id && l.log_date === k).reduce((a, l) => a + l.count, 0);
  // Tap cycles 0 → 1 → … → target → 0, so multi-count habits can be logged too.
  const next = (k: string) => {
    const c = countOn(k);
    return c >= Math.max(dailyTarget, 1) ? 0 : c + 1;
  };

  return (
    <Card className={cn("grid gap-3 p-4", isPaused && "opacity-70")}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="flex flex-wrap items-center gap-2 text-[14px] font-medium">
            <span className="truncate">{h.name}</span>
            <ProvenanceBadge source={h.source} />
            {isPaused && <Badge variant="outline"><Pause /> Paused</Badge>}
          </h3>
          <p className="text-[12px] text-muted-foreground">{scheduleText(h)}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Options for ${h.name}`}><MoreHorizontal /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}><Pencil /> Edit</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onPause(!isPaused)}>{isPaused ? <><Play /> Resume</> : <><Pause /> Pause</>}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onArchive(true)}><Archive /> Archive</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive"><Trash2 /> Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <ol className="flex gap-1.5" aria-label="Last 7 days">
          {s.last7.map((d) => {
            const c = countOn(d.date);
            const off = d.state === "off" && c === 0;
            const label = `${formatShortDate(d.date, ws.locale)}: ${c ? `${c}${dailyTarget > 1 ? ` of ${dailyTarget}` : ""} done` : off ? "not scheduled" : d.state === "before" ? "before you started" : "not done"}`;
            return (
              <li key={d.date} className="grid justify-items-center gap-1">
                <span className="text-[10px] text-subtle-foreground">{d.date === ws.today ? "Today" : DAY_SHORT[new Date(`${d.date}T12:00:00Z`).getUTCDay()].slice(0, 2)}</span>
                <button
                  aria-label={label}
                  title={label}
                  disabled={pending || isPaused || d.state === "before"}
                  onClick={() => onLog(d.date, next(d.date))}
                  className={cn(
                    "flex size-8 cursor-pointer items-center justify-center rounded-md border text-[11px] transition-colors disabled:cursor-not-allowed",
                    d.state === "done" && "border-success bg-success text-white",
                    c > 0 && d.state !== "done" && "border-success/60 bg-success/15 text-success",
                    c === 0 && d.state === "missed" && "border-destructive/30 bg-destructive/5",
                    c === 0 && (d.state === "future" || d.state === "off") && "border-border hover:bg-muted",
                    off && "border-dashed",
                    d.state === "before" && "border-transparent bg-muted/50",
                    d.date === ws.today && d.state !== "done" && "ring-1 ring-ring/50",
                  )}
                >
                  {d.state === "done" ? <Check className="size-4" aria-hidden /> : c > 0 ? <span className="tabular">{c}</span> : null}
                </button>
              </li>
            );
          })}
        </ol>
        <dl className="grid shrink-0 grid-cols-2 gap-x-4 text-right">
          {h.cadence === "daily" ? (
            <div>
              <dt className="text-[10px] text-subtle-foreground">Streak</dt>
              <dd className="tabular flex items-center justify-end gap-1 text-[15px] font-medium">{s.streak > 2 && <Flame className="size-3.5 text-warning" aria-hidden />}{s.streak}</dd>
            </div>
          ) : (
            <div>
              <dt className="text-[10px] text-subtle-foreground">This week</dt>
              <dd className="tabular text-[15px] font-medium">{s.week?.done ?? 0}/{s.week?.target}</dd>
            </div>
          )}
          <div>
            <dt className="text-[10px] text-subtle-foreground">{h.cadence === "daily" ? "30 days" : "4 weeks"}</dt>
            <dd className="tabular text-[15px] font-medium">{s.consistency30 === null ? <span className="text-muted-foreground" title="Not enough history yet">–</span> : `${s.consistency30}%`}</dd>
          </div>
        </dl>
      </div>

      <details className="group">
        <summary className="cursor-pointer text-[12px] text-muted-foreground hover:text-foreground">12-week history</summary>
        <div className="mt-2 flex gap-[3px]" role="img" aria-label={`${s.total84} completions in the last 12 weeks`}>
          {s.history.map((col, i) => (
            <div key={i} className="grid gap-[3px]">
              {col.map((c) => (
                <span
                  key={c.date}
                  title={`${formatShortDate(c.date, ws.locale)}: ${c.count || "–"}`}
                  className={cn(
                    "size-3 rounded-[3px]",
                    c.future || c.beforeStart ? "bg-transparent" : c.done ? "bg-success" : c.count > 0 ? "bg-success/40" : c.scheduled ? "bg-muted" : "bg-muted/40",
                  )}
                />
              ))}
            </div>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">{s.total84} completions since {formatShortDate(s.history[0][0].date, ws.locale)}.</p>
      </details>
    </Card>
  );
}
