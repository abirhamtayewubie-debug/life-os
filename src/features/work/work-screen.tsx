"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Briefcase, Clock, Pencil, Play, Plus, Square, Trash2 } from "lucide-react";
import { ConfirmDelete } from "@/components/data/confirm-delete";
import { EmptyState } from "@/components/data/empty-state";
import { ProvenanceBadge } from "@/components/data/provenance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { addDays, diffDays, formatShortDate, formatTime, localDateKey } from "@/lib/dates";
import { formatMoney, percentOf } from "@/lib/money";
import { cn } from "@/lib/utils";
import { deleteProject, deleteTimeEntry, logTime, startTimer, stopTimer } from "@/server/actions/work";
import { useServerAction } from "@/features/dashboard/use-server-action";
import { MilestoneList } from "@/features/goals/milestone-list";
import { ProjectBoard } from "./project-board";
import { ProjectForm } from "./project-form";
import { spendIn } from "@/features/finance/ledger";
import { entryMinutes, formatDuration, projectProgress, timelineWindow, weekTotals } from "./stats";
import { PROJECT_STATUS_LABEL, type ProjectRecord, type WorkWorkspace } from "./types";

type Tab = "projects" | "board" | "timeline" | "time";
const TABS: { v: Tab; label: string }[] = [
  { v: "projects", label: "Projects" },
  { v: "board", label: "Board" },
  { v: "timeline", label: "Timeline" },
  { v: "time", label: "Time" },
];

export function WorkScreen({ ws, tab, projectId, nowIso, startNew = false }: { ws: WorkWorkspace; tab: Tab; projectId: string | null; nowIso: string; startNew?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [editing, setEditing] = useState<ProjectRecord | "new" | null>(startNew ? "new" : null);
  const [openId, setOpenId] = useState<string | null>(null);
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const go = (t: Tab, p?: string | null) => router.replace(`${pathname}?tab=${t}${p ? `&project=${p}` : ""}`, { scroll: false });

  const live = ws.projects.filter((p) => p.status !== "completed" && p.status !== "cancelled");
  const closed = ws.projects.filter((p) => p.status === "completed" || p.status === "cancelled");
  const boardProject = ws.projects.find((p) => p.id === projectId) ?? live[0] ?? null;
  const week = weekTotals(ws.time, ws.today, ws.timezone, now);
  const open = openId ? ws.projects.find((p) => p.id === openId) ?? null : null;

  useEffect(() => {
    const onNew = () => setEditing("new");
    window.addEventListener("lifeos:new-project", onNew);
    return () => window.removeEventListener("lifeos:new-project", onNew);
  }, []);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Work views" className="flex rounded-md bg-muted p-0.5">
          {TABS.map((t) => (
            <button key={t.v} role="tab" aria-selected={tab === t.v} onClick={() => go(t.v, t.v === "board" ? boardProject?.id : null)} className={cn("h-7 cursor-pointer rounded px-3 text-[13px] text-muted-foreground", tab === t.v && "bg-surface font-medium text-foreground shadow-card")}>
              {t.label}
            </button>
          ))}
        </div>
        {tab === "board" && ws.projects.length > 0 && (
          <NativeSelect aria-label="Project" className="w-auto max-w-64" value={boardProject?.id ?? ""} onChange={(e) => go("board", e.target.value)}>
            {[...live, ...closed].map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </NativeSelect>
        )}
        <Button size="sm" className="ml-auto" onClick={() => setEditing("new")}><Plus /> New project</Button>
      </div>

      {ws.projects.length === 0 && tab !== "time" ? (
        <Card>
          <EmptyState icon={Briefcase} title="No projects yet" action={<Button size="sm" onClick={() => setEditing("new")}><Plus /> Add a project</Button>}>
            Group related tasks into a project to see them on a board and a timeline, track milestones and log time.
          </EmptyState>
        </Card>
      ) : tab === "projects" ? (
        <div className="grid gap-6">
          <ProjectGrid projects={live} ws={ws} week={week} onOpen={setOpenId} />
          {closed.length > 0 && (
            <details>
              <summary className="cursor-pointer text-[13px] text-muted-foreground hover:text-foreground">Completed and cancelled ({closed.length})</summary>
              <div className="mt-3"><ProjectGrid projects={closed} ws={ws} week={week} onOpen={setOpenId} /></div>
            </details>
          )}
        </div>
      ) : tab === "board" ? (
        boardProject && <ProjectBoard key={boardProject.id} projectId={boardProject.id} tasks={ws.tasks} today={ws.today} />
      ) : tab === "timeline" ? (
        <Timeline projects={live} ws={ws} onOpen={setOpenId} />
      ) : (
        <TimePanel ws={ws} now={now} week={week} />
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "New project" : "Edit project"}</DialogTitle>
            <DialogDescription className="sr-only">Project details</DialogDescription>
          </DialogHeader>
          {editing && <ProjectForm project={editing === "new" ? null : editing} ws={ws} onDone={() => setEditing(null)} onCancel={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-w-xl">
          {open && <ProjectDetail p={open} ws={ws} week={week} onEdit={() => { setOpenId(null); setEditing(open); }} onBoard={() => { setOpenId(null); go("board", open.id); }} onClose={() => setOpenId(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function dueLabel(p: ProjectRecord, today: string, locale: string) {
  if (!p.due_date) return null;
  const d = diffDays(today, p.due_date);
  if (p.status === "completed" || p.status === "cancelled") return { text: `Due ${formatShortDate(p.due_date, locale)}`, late: false };
  if (d < 0) return { text: `${-d} days overdue`, late: true };
  if (d === 0) return { text: "Due today", late: false };
  return { text: `Due ${formatShortDate(p.due_date, locale)} · ${d} days`, late: false };
}

function ProjectGrid({ projects, ws, week, onOpen }: { projects: ProjectRecord[]; ws: WorkWorkspace; week: Map<string | null, number>; onOpen: (id: string) => void }) {
  if (!projects.length) return <p className="text-[13px] text-muted-foreground">No active projects.</p>;
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {projects.map((p) => {
        const prog = projectProgress(p, ws.tasks);
        const ms = ws.milestones.filter((m) => m.project_id === p.id);
        const next = ms.filter((m) => !m.completed_at).sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"))[0];
        const due = dueLabel(p, ws.today, ws.locale);
        const goal = ws.goals.find((g) => g.id === p.goal_id);
        return (
          <Card key={p.id} className="p-0">
            <button type="button" onClick={() => onOpen(p.id)} className="grid w-full cursor-pointer gap-3 p-4 text-left">
              <span className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 text-[14px] font-medium">{p.name}</span>
                {p.status !== "active" && <Badge variant="outline">{PROJECT_STATUS_LABEL[p.status]}</Badge>}
                <ProvenanceBadge source={p.source} />
              </span>
              <span className="grid gap-1">
                <Progress value={prog.pct ?? 0} aria-label={prog.pct === null ? "No tasks yet" : `${prog.pct}% of tasks done`} />
                <span className="flex justify-between text-[11px] text-muted-foreground">
                  <span>{prog.total ? `${prog.done} of ${prog.total} tasks done` : "No tasks yet"}</span>
                  {due && <span className={cn(due.late && "text-destructive")}>{due.text}</span>}
                </span>
              </span>
              <span className="grid gap-0.5 text-[12px] text-muted-foreground">
                {next && <span className="truncate">Next milestone: <span className="text-foreground">{next.title}</span>{next.due_date ? ` · ${formatShortDate(next.due_date, ws.locale)}` : ""}</span>}
                {goal && <span className="truncate">Goal: {goal.title}</span>}
                <span className="flex gap-3">
                  {(week.get(p.id) ?? 0) > 0 && <span className="flex items-center gap-1"><Clock className="size-3" aria-hidden /> {formatDuration(week.get(p.id)!)} this week</span>}
                  {p.budget_amount && p.budget_currency && <span>{budgetLine(p, ws)}</span>}
                </span>
              </span>
            </button>
          </Card>
        );
      })}
    </div>
  );
}

function ProjectDetail({ p, ws, week, onEdit, onBoard, onClose }: { p: ProjectRecord; ws: WorkWorkspace; week: Map<string | null, number>; onEdit: () => void; onBoard: () => void; onClose: () => void }) {
  const { pending, run } = useServerAction();
  const prog = projectProgress(p, ws.tasks);
  const total = ws.time.filter((t) => t.project_id === p.id).reduce((a, t) => a + entryMinutes(t, new Date()), 0);
  return (
    <div className="grid gap-5">
      <DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{PROJECT_STATUS_LABEL[p.status]}</Badge>
          <Badge>{p.area[0].toUpperCase() + p.area.slice(1)}</Badge>
        </div>
        <DialogTitle className="text-lg">{p.name}</DialogTitle>
        <DialogDescription className={p.description ? "whitespace-pre-wrap" : "sr-only"}>{p.description ?? "Project details"}</DialogDescription>
      </DialogHeader>
      <dl className="grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
        <div><dt className="text-[11px] text-muted-foreground">Tasks</dt><dd className="tabular">{prog.done}/{prog.total}</dd></div>
        <div><dt className="text-[11px] text-muted-foreground">Dates</dt><dd className="tabular">{p.start_date ? formatShortDate(p.start_date, ws.locale) : "–"} → {p.due_date ? formatShortDate(p.due_date, ws.locale) : "–"}</dd></div>
        <div><dt className="text-[11px] text-muted-foreground">This week</dt><dd className="tabular">{formatDuration(week.get(p.id) ?? 0)}</dd></div>
        <div><dt className="text-[11px] text-muted-foreground">Last 60 days</dt><dd className="tabular">{formatDuration(total)}</dd></div>
      </dl>
      <ProjectBudget p={p} ws={ws} />
      <section className="grid gap-2">
        <h3 className="text-[13px] font-medium">Milestones</h3>
        <MilestoneList milestones={ws.milestones.filter((m) => m.project_id === p.id)} parent={{ projectId: p.id }} today={ws.today} locale={ws.locale} />
      </section>
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Button variant="outline" size="sm" onClick={onEdit}><Pencil /> Edit</Button>
        <Button variant="outline" size="sm" onClick={onBoard}>Open board</Button>
        <span className="ml-auto">
          <ConfirmDelete
            title={`Delete “${p.name}”?`}
            description="This permanently deletes the project, its milestones and its time log. Its tasks are kept and simply unlinked. To keep a record, set the status to Completed or Cancelled instead."
            confirmLabel="Delete project"
            disabled={pending}
            onConfirm={() => run(() => deleteProject(p.id), { onSuccess: onClose })}
          />
        </span>
      </div>
    </div>
  );
}

function Timeline({ projects, ws, onOpen }: { projects: ProjectRecord[]; ws: WorkWorkspace; onOpen: (id: string) => void }) {
  const dated = projects.filter((p) => p.start_date || p.due_date);
  const undated = projects.filter((p) => !p.start_date && !p.due_date);
  const win = timelineWindow(dated, ws.today);
  const months: { key: string; left: number }[] = [];
  for (let k = `${win.from.slice(0, 7)}-01`; k <= win.to; k = `${addDays(`${k.slice(0, 7)}-28`, 7).slice(0, 7)}-01`) {
    if (k >= win.from) months.push({ key: k, left: win.pos(k) });
  }
  return (
    <Card className="overflow-x-auto p-4">
      <div className="min-w-[40rem]">
        <div className="relative mb-2 h-5 text-[11px] text-muted-foreground">
          {months.map((m) => (
            <span key={m.key} className="absolute -translate-x-1/2" style={{ left: `${m.left}%` }}>
              {new Intl.DateTimeFormat(ws.locale, { month: "short", timeZone: "UTC" }).format(new Date(`${m.key}T12:00:00Z`))}
            </span>
          ))}
        </div>
        <div className="relative grid gap-2">
          <div className="pointer-events-none absolute inset-y-0 w-px bg-destructive/70" style={{ left: `${win.pos(ws.today)}%` }} aria-hidden />
          {dated.length === 0 && <p className="py-6 text-center text-[13px] text-muted-foreground">Give projects a start or due date to see them here.</p>}
          {dated.map((p) => {
            const s = p.start_date ?? p.due_date!;
            const e = p.due_date ?? addDays(s, 7);
            const left = win.pos(s);
            const width = Math.max(1.5, win.pos(e) - left);
            const ms = ws.milestones.filter((m) => m.project_id === p.id && m.due_date);
            const prog = projectProgress(p, ws.tasks);
            return (
              <div key={p.id} className="relative h-9">
                <button
                  type="button"
                  onClick={() => onOpen(p.id)}
                  className={cn("absolute inset-y-1 cursor-pointer overflow-hidden rounded-md border border-brand/40 bg-accent text-left text-[12px] hover:border-brand", !p.due_date && "border-dashed")}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`${p.name}: ${s} → ${p.due_date ?? "no due date"}`}
                >
                  <span className="absolute inset-y-0 left-0 bg-brand/25" style={{ width: `${prog.pct ?? 0}%` }} aria-hidden />
                  <span className="relative block truncate px-2 leading-7">{p.name}</span>
                </button>
                {ms.map((m) => (
                  <span
                    key={m.id}
                    className={cn("absolute top-0 size-2.5 -translate-x-1/2 rotate-45 border border-surface", m.completed_at ? "bg-success" : "bg-warning")}
                    style={{ left: `${win.pos(m.due_date!)}%` }}
                    title={`${m.title} · ${m.due_date}${m.completed_at ? " · reached" : ""}`}
                    aria-label={`Milestone ${m.title}, ${m.due_date}${m.completed_at ? ", reached" : ""}`}
                    role="img"
                  />
                ))}
              </div>
            );
          })}
        </div>
        {undated.length > 0 && <p className="mt-3 text-[12px] text-muted-foreground">Not shown (no dates): {undated.map((p) => p.name).join(", ")}</p>}
      </div>
    </Card>
  );
}

function TimePanel({ ws, now, week }: { ws: WorkWorkspace; now: Date; week: Map<string | null, number> }) {
  const { pending, run } = useServerAction();
  const running = ws.time.find((t) => !t.ended_at) ?? null;
  const live = ws.projects.filter((p) => p.status === "active" || p.status === "planned" || p.status === "on_hold");
  const [project, setProject] = useState(live[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [tick, setTick] = useState(now.getTime());
  const [manual, setManual] = useState({ projectId: live[0]?.id ?? "", date: ws.today, start: "09:00", minutes: "60", note: "" });
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const name = (id: string | null) => ws.projects.find((p) => p.id === id)?.name ?? "No project";

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTick(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [running]);

  const recent = ws.time.filter((t) => t.ended_at && localDateKey(new Date(t.started_at), ws.timezone) >= addDays(ws.today, -13));
  const weekTotal = [...week.values()].reduce((a, b) => a + b, 0);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4">
        <Card className="grid grid-cols-[minmax(0,1fr)] gap-3 p-4">
          <h3 className="flex items-center gap-1.5 text-[13px] font-medium"><Clock className="size-3.5 text-muted-foreground" /> Timer</h3>
          {running ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="relative flex size-2.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive/60" /><span className="relative inline-flex size-2.5 rounded-full bg-destructive" /></span>
              <span className="text-[13px]">{name(running.project_id)}{running.note ? ` · ${running.note}` : ""}</span>
              <span className="tabular text-[13px] text-muted-foreground">since {formatTime(running.started_at, ws.timezone, ws.locale)} · {formatDuration(entryMinutes(running, new Date(tick)))}</span>
              <Button size="sm" className="ml-auto" disabled={pending} onClick={() => run(() => stopTimer())}><Square /> Stop</Button>
            </div>
          ) : live.length ? (
            <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); run(() => startTimer(project, null, note), { onSuccess: () => setNote("") }); }}>
              <NativeSelect aria-label="Project to time" className="w-full sm:w-auto sm:max-w-60" value={project} onChange={(e) => setProject(e.target.value)}>
                {live.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </NativeSelect>
              <Input className="min-w-40 flex-1" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="What are you working on?" aria-label="Timer note" />
              <Button type="submit" disabled={pending || !project}><Play /> Start</Button>
            </form>
          ) : (
            <p className="text-[13px] text-muted-foreground">Add a project to start tracking time.</p>
          )}
          <p className="text-[11px] text-muted-foreground">The timer keeps running if you close the tab. Entries over 24 hours are capped.</p>
        </Card>

        <Card className="p-4">
          <h3 className="mb-2 text-[13px] font-medium">Last 14 days</h3>
          {recent.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No time logged yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((t) => (
                <li key={t.id} className="group flex items-center gap-3 py-2 text-[13px]">
                  <span className="tabular w-20 shrink-0 text-[12px] text-muted-foreground">{formatShortDate(localDateKey(new Date(t.started_at), ws.timezone), ws.locale)}</span>
                  <span className="min-w-0 flex-1 truncate">{name(t.project_id)}{t.note ? <span className="text-muted-foreground"> · {t.note}</span> : null}</span>
                  {t.source === "sample" && <Badge variant="sample">Sample</Badge>}
                  <span className="tabular shrink-0">{formatDuration(entryMinutes(t, now))}</span>
                  <Button variant="ghost" size="icon-sm" className="size-7 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 focus-visible:opacity-100" aria-label="Delete entry" onClick={() => run(() => deleteTimeEntry(t.id))}><Trash2 /></Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid content-start gap-4">
        <Card className="p-4">
          <h3 className="text-[13px] font-medium">This week</h3>
          <p className="tabular mt-1 text-2xl font-medium tracking-tight">{formatDuration(weekTotal)}</p>
          <ul className="mt-3 grid gap-2">
            {[...week.entries()].sort((a, b) => b[1] - a[1]).map(([pid, min]) => (
              <li key={pid ?? "none"} className="grid gap-1 text-[12px]">
                <span className="flex justify-between gap-2"><span className="truncate">{name(pid)}</span><span className="tabular text-muted-foreground">{formatDuration(min)}</span></span>
                <Progress value={weekTotal ? (min / weekTotal) * 100 : 0} aria-hidden />
              </li>
            ))}
          </ul>
        </Card>
        {live.length > 0 && (
          <Card className="p-4">
            <form
              className="grid gap-3"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                setErrors({});
                run(async () => {
                  const r = await logTime(manual);
                  if (!r.ok && r.fieldErrors) setErrors(r.fieldErrors);
                  return r;
                }, { onSuccess: () => setManual((m) => ({ ...m, note: "" })) });
              }}
            >
              <h3 className="text-[13px] font-medium">Add time you forgot to track</h3>
              <Field id="manual-project" label="Project">
                <NativeSelect id="manual-project" value={manual.projectId} onChange={(e) => setManual({ ...manual, projectId: e.target.value })}>
                  {live.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </NativeSelect>
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Field id="manual-date" label="Date" error={errors.date?.[0]} className="col-span-3 sm:col-span-1 lg:col-span-3">
                  <Input id="manual-date" type="date" max={ws.today} value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} />
                </Field>
                <Field id="manual-start" label="Start" error={errors.start?.[0]} className="col-span-3 sm:col-span-1 lg:col-span-1">
                  <Input id="manual-start" type="time" value={manual.start} onChange={(e) => setManual({ ...manual, start: e.target.value })} />
                </Field>
                <Field id="manual-minutes" label="Minutes" error={errors.minutes?.[0]} className="col-span-3 sm:col-span-1 lg:col-span-2">
                  <Input id="manual-minutes" type="number" min={1} max={1440} value={manual.minutes} onChange={(e) => setManual({ ...manual, minutes: e.target.value })} />
                </Field>
              </div>
              <Input value={manual.note} maxLength={1000} onChange={(e) => setManual({ ...manual, note: e.target.value })} placeholder="Note (optional)" aria-label="Note" />
              <Button type="submit" variant="outline" disabled={pending}>Log time</Button>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}

function projectSpend(p: ProjectRecord, ws: WorkWorkspace) {
  const items = ws.spending.filter((t) => t.project_id === p.id);
  return p.budget_currency ? spendIn(p.budget_currency, items, ws.rates) : null;
}

function budgetLine(p: ProjectRecord, ws: WorkWorkspace) {
  const s = projectSpend(p, ws);
  const budget = formatMoney({ amount: p.budget_amount!, currency: p.budget_currency! }, ws.locale);
  return s && s.count ? `${formatMoney(s.spent, ws.locale)} of ${budget} spent` : `Budget ${budget}`;
}

/** Spending tagged with the project in Finance, against its budget. Other currencies use the person's own rates, or are listed apart. */
function ProjectBudget({ p, ws }: { p: ProjectRecord; ws: WorkWorkspace }) {
  const items = ws.spending.filter((t) => t.project_id === p.id);
  if (!p.budget_amount || !p.budget_currency) {
    if (!items.length) return null;
    return (
      <section className="grid gap-1 text-[13px]">
        <h3 className="font-medium">Spending</h3>
        <p className="text-[12px] text-muted-foreground">{items.length} expense{items.length === 1 ? "" : "s"} tagged in Finance. Add a budget to the project to track it.</p>
      </section>
    );
  }
  const limit = { amount: p.budget_amount, currency: p.budget_currency };
  const s = spendIn(p.budget_currency, items, ws.rates);
  const pct = percentOf(s.spent, limit);
  return (
    <section className="grid gap-1.5">
      <div className="flex flex-wrap items-baseline gap-2 text-[13px]">
        <h3 className="font-medium">Budget</h3>
        <span className="ml-auto text-[12px] text-muted-foreground">
          <span className="tabular text-foreground">{formatMoney(s.spent, ws.locale)}</span> of <span className="tabular">{formatMoney(limit, ws.locale)}</span> spent
        </span>
      </div>
      <Progress value={pct} aria-label={`${Math.round(pct)}% of the budget spent`} indicatorClassName={pct >= 100 ? "bg-destructive" : undefined} />
      <p className="text-[11px] text-muted-foreground">
        {items.length ? `From ${items.length} expense${items.length === 1 ? "" : "s"} tagged with this project in Finance.` : "Tag expenses with this project in Finance to track spending here."}
        {s.oldestRate && ` Converted with your rate from ${s.oldestRate}.`}
        {s.unconverted.length > 0 && ` Not counted, no rate to ${p.budget_currency} yet: ${s.unconverted.map((m) => formatMoney(m, ws.locale)).join(", ")}.`}
      </p>
    </section>
  );
}
