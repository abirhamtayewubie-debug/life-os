"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlarmClock, Bookmark, CalendarClock, CircleCheck, Inbox, ListChecks, Plus, Search, Sun, Trash2, TriangleAlert, X } from "lucide-react";
import { EmptyState } from "@/components/data/empty-state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, NativeSelect } from "@/components/ui/input";
import { formatTime, localDateKey } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { deleteTaskView, saveTaskView } from "@/server/actions/tasks";
import { completeReminder, snoozeReminder } from "@/server/actions/reminders";
import { useServerAction } from "@/features/dashboard/use-server-action";
import { applyFilters, filtersToSearch, groupTasks, viewCounts } from "./filters";
import { TaskDetail } from "./task-detail";
import { TaskForm } from "./task-form";
import { TaskItem } from "./task-list";
import { AREAS, PRIORITY_LABEL, type TaskFilters, type TaskView, type TaskWorkspace } from "./types";

const VIEWS: { v: TaskView; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { v: "today", label: "Today", icon: Sun },
  { v: "upcoming", label: "Upcoming", icon: CalendarClock },
  { v: "overdue", label: "Overdue", icon: TriangleAlert },
  { v: "nodate", label: "No date", icon: Inbox },
  { v: "all", label: "All open", icon: ListChecks },
  { v: "done", label: "Completed", icon: CircleCheck },
];

const EMPTY: Record<TaskView, { title: string; body: string }> = {
  today: { title: "Nothing due today", body: "Tasks due today, overdue work and anything you mark as today's focus show up here." },
  upcoming: { title: "Nothing in the next two weeks", body: "Give tasks a due date to plan ahead." },
  overdue: { title: "Nothing overdue", body: "Nicely done." },
  nodate: { title: "No undated tasks", body: "Capture ideas here without committing to a date." },
  all: { title: "No open tasks", body: "Add your first task to get started." },
  done: { title: "Nothing completed in the last 90 days", body: "Completed tasks are kept here so you can look back." },
};

export function TasksScreen({ ws, filters, nowIso, openId, startNew = false }: { ws: TaskWorkspace; filters: TaskFilters; nowIso: string; openId?: string; startNew?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [q, setQ] = useState(filters.q ?? "");
  const [creating, setCreating] = useState(startNew);
  const [openTaskId, setOpenTaskId] = useState<string | null>(openId ?? null);
  const [savingView, setSavingView] = useState(false);
  const [viewName, setViewName] = useState("");
  const { pending, run } = useServerAction();

  const go = (f: TaskFilters) => router.replace(`${pathname}?${filtersToSearch(f)}`, { scroll: false });

  useEffect(() => {
    const t = setTimeout(() => { if ((filters.q ?? "") !== q) go({ ...filters, q: q || undefined }); }, 250);
    return () => clearTimeout(t);
  });

  useEffect(() => {
    const onNew = () => setCreating(true);
    window.addEventListener("lifeos:new-task", onNew);
    return () => window.removeEventListener("lifeos:new-task", onNew);
  }, []);

  const visible = applyFilters(ws.tasks, filters, now, ws.timezone);
  const groups = groupTasks(visible, filters.view, now, ws.timezone);
  const counts = viewCounts(ws.tasks, now, ws.timezone);
  const openTask = openTaskId ? ws.tasks.find((t) => t.id === openTaskId) ?? null : null;
  const today = localDateKey(now, ws.timezone);
  const dueReminders = ws.reminders.filter((r) => new Date(r.snoozed_until ?? r.remind_at) <= now);
  const laterReminders = ws.reminders
    .filter((r) => new Date(r.snoozed_until ?? r.remind_at) > now)
    .sort((a, b) => (a.snoozed_until ?? a.remind_at).localeCompare(b.snoozed_until ?? b.remind_at))
    .slice(0, 8);
  const hasExtraFilters = Boolean(filters.q || filters.priority || filters.area || filters.tag || filters.project);

  return (
    <div className="grid gap-6 lg:grid-cols-[13rem_1fr] xl:grid-cols-[13rem_1fr_18rem]">
      {/* Views */}
      <nav aria-label="Task views" className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
        {VIEWS.map((v) => (
          <button
            key={v.v}
            onClick={() => go({ view: v.v })}
            aria-current={filters.view === v.v && !hasExtraFilters ? "page" : undefined}
            className={cn(
              "flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-md px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              filters.view === v.v && !hasExtraFilters && "bg-muted font-medium text-foreground",
            )}
          >
            <v.icon className="size-4" />
            {v.label}
            {counts[v.v] > 0 && <span className={cn("tabular ml-auto pl-2 text-[11px]", v.v === "overdue" && "text-destructive")}>{counts[v.v]}</span>}
          </button>
        ))}
        {ws.savedViews.length > 0 && <div className="mt-3 hidden px-2.5 pb-1 text-[11px] font-medium tracking-wide text-subtle-foreground uppercase lg:block">Saved views</div>}
        {ws.savedViews.map((sv) => (
          <div key={sv.id} className="group flex shrink-0 items-center">
            <button onClick={() => go(sv.filters)} className="flex h-8 flex-1 cursor-pointer items-center gap-2 rounded-md px-2.5 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground">
              <Bookmark className="size-4" /> {sv.name}
            </button>
            <Button variant="ghost" size="icon-sm" className="size-7 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Delete view ${sv.name}`} onClick={() => run(() => deleteTaskView(sv.id))}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
      </nav>

      {/* List */}
      <section aria-label="Tasks" className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle-foreground" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks" aria-label="Search tasks" className="pl-8" />
          </div>
          <NativeSelect aria-label="Priority" className="w-auto" value={filters.priority ?? ""} onChange={(e) => go({ ...filters, priority: e.target.value ? (Number(e.target.value) as 1) : undefined })}>
            <option value="">Any priority</option>
            {([1, 2, 3, 4] as const).map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </NativeSelect>
          <NativeSelect aria-label="Area" className="w-auto" value={filters.area ?? ""} onChange={(e) => go({ ...filters, area: e.target.value || undefined })}>
            <option value="">Any area</option>
            {AREAS.map((a) => <option key={a} value={a}>{a[0].toUpperCase() + a.slice(1)}</option>)}
          </NativeSelect>
          {ws.tags.length > 0 && (
            <NativeSelect aria-label="Tag" className="w-auto" value={filters.tag ?? ""} onChange={(e) => go({ ...filters, tag: e.target.value || undefined })}>
              <option value="">Any tag</option>
              {ws.tags.map((t) => <option key={t.id} value={t.id}>#{t.name}</option>)}
            </NativeSelect>
          )}
          {ws.projects.length > 0 && (
            <NativeSelect aria-label="Project" className="w-auto max-w-48" value={filters.project ?? ""} onChange={(e) => go({ ...filters, project: e.target.value || undefined })}>
              <option value="">Any project</option>
              {ws.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </NativeSelect>
          )}
          {hasExtraFilters && (
            <>
              <Button variant="ghost" size="sm" onClick={() => { setQ(""); go({ view: filters.view }); }}><X /> Clear</Button>
              <Button variant="outline" size="sm" onClick={() => setSavingView(true)}><Bookmark /> Save view</Button>
            </>
          )}
          <Button size="sm" className="ml-auto" onClick={() => setCreating(true)}><Plus /> New task</Button>
        </div>

        {groups.length ? (
          <div className="grid gap-5">
            {groups.map((g) => (
              <div key={g.key}>
                <h2 className={cn("mb-1 flex items-center gap-2 px-2 text-xs font-medium text-muted-foreground", g.key === "overdue" && "text-destructive")}>
                  {g.label} <span className="tabular text-subtle-foreground">{g.tasks.length}</span>
                </h2>
                <ul className="grid">
                  {g.tasks.map((t) => <TaskItem key={t.id} task={t} all={ws.tasks} now={now} tz={ws.timezone} locale={ws.locale} onOpen={(x) => setOpenTaskId(x.id)} />)}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border">
            <EmptyState icon={ListChecks} title={hasExtraFilters ? "No tasks match these filters" : EMPTY[filters.view].title} action={!hasExtraFilters && filters.view !== "done" ? <Button size="sm" onClick={() => setCreating(true)}><Plus /> New task</Button> : undefined}>
              {hasExtraFilters ? "Try clearing a filter." : EMPTY[filters.view].body}
            </EmptyState>
          </div>
        )}
      </section>

      {/* Reminders */}
      <aside aria-label="Reminders" className="grid content-start gap-3 lg:col-span-2 xl:col-span-1">
        <div className="rounded-3xl bg-card p-5 shadow-card">
          <h2 className="flex items-center gap-1.5 text-[13px] font-medium"><AlarmClock className="size-3.5 text-muted-foreground" /> Reminders</h2>
          {dueReminders.length === 0 && laterReminders.length === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">No reminders set. Open a task to add one.</p>
          )}
          {dueReminders.length > 0 && (
            <ul className="mt-3 grid gap-2">
              {dueReminders.map((r) => (
                <li key={r.id} className="rounded-lg border border-warning/40 bg-warning/8 p-2.5">
                  <p className="text-[13px]">{r.title}</p>
                  <p className="tabular text-[11px] text-muted-foreground">Due {formatTime(r.snoozed_until ?? r.remind_at, ws.timezone, ws.locale)}{r.status === "snoozed" ? " · snoozed" : ""}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Button size="xs" variant="outline" disabled={pending} onClick={() => run(() => completeReminder(r.id))}>Done</Button>
                    <Button size="xs" variant="ghost" disabled={pending} onClick={() => run(() => snoozeReminder(r.id, 10))}>10 min</Button>
                    <Button size="xs" variant="ghost" disabled={pending} onClick={() => run(() => snoozeReminder(r.id, 60))}>1 hour</Button>
                    <Button size="xs" variant="ghost" disabled={pending} onClick={() => run(() => snoozeReminder(r.id, "tomorrow"))}>Tomorrow</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {laterReminders.length > 0 && (
            <ul className="mt-3 grid gap-1.5">
              {laterReminders.map((r) => {
                const at = r.snoozed_until ?? r.remind_at;
                const k = localDateKey(new Date(at), ws.timezone);
                return (
                  <li key={r.id} className="flex items-baseline gap-2 text-[13px]">
                    <span className="min-w-0 flex-1 truncate">{r.title}</span>
                    <span className="tabular shrink-0 text-[11px] text-muted-foreground">{k === today ? "" : `${k.slice(5)} `}{formatTime(at, ws.timezone, ws.locale)}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 border-t border-border pt-2.5 text-[11px] leading-relaxed text-subtle-foreground">
            Also sent as notifications to devices where you turned them on in Settings.
          </p>
        </div>
      </aside>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>New task</DialogTitle><DialogDescription>Only the title is required.</DialogDescription></DialogHeader>
          <TaskForm
            task={null}
            tz={ws.timezone}
            projects={ws.projects}
            goals={ws.goals}
            defaults={{ dueDate: filters.view === "today" ? today : "", isTopPriority: false, area: (filters.area as never) ?? "personal", projectId: filters.project ?? "" }}
            onDone={() => setCreating(false)}
            onCancel={() => setCreating(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!openTask} onOpenChange={(o) => !o && setOpenTaskId(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Edit task</DialogTitle><DialogDescription className="sr-only">Edit details, subtasks, dependencies and reminders.</DialogDescription></DialogHeader>
          {openTask && <TaskDetail key={openTask.id + openTask.updated_at} task={openTask} all={ws.tasks} reminders={ws.reminders} projects={ws.projects} goals={ws.goals} tz={ws.timezone} locale={ws.locale} onClose={() => setOpenTaskId(null)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={savingView} onOpenChange={setSavingView}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Save this view</DialogTitle><DialogDescription>Keep these filters one click away.</DialogDescription></DialogHeader>
          <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); run(() => saveTaskView({ name: viewName, filters: filters as Parameters<typeof saveTaskView>[0]["filters"] }), { onSuccess: () => { setSavingView(false); setViewName(""); } }); }}>
            <Input autoFocus value={viewName} maxLength={60} onChange={(e) => setViewName(e.target.value)} placeholder="e.g. Client work this week" aria-label="View name" />
            <Button type="submit" disabled={!viewName.trim() || pending}>Save view</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
