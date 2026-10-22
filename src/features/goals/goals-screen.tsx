"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Ban, CheckCircle2, ChevronRight, Pause, Pencil, Play, Plus, Target, TrendingUp } from "lucide-react";
import { ConfirmDelete } from "@/components/data/confirm-delete";
import { EmptyState } from "@/components/data/empty-state";
import { ProvenanceBadge } from "@/components/data/provenance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { diffDays, formatShortDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { deleteGoal, logGoalProgress, setGoalStatus } from "@/server/actions/goals";
import { useServerAction } from "@/features/dashboard/use-server-action";
import { GoalForm } from "./goal-form";
import { MilestoneList } from "./milestone-list";
import { buildTree, flatten, formatMetric, metricPct, milestonePct, type GoalNode } from "./tree";
import { LEVEL_LABEL, STATUS_LABEL, type GoalInputDefaults, type GoalRecord, type GoalWorkspace } from "./types";

type Filter = "active" | "all" | "done";

export function GoalsScreen({ ws, startNew = false, initialOpen = null }: { ws: GoalWorkspace; startNew?: boolean; initialOpen?: string | null }) {
  const [filter, setFilter] = useState<Filter>("active");
  const [editing, setEditing] = useState<{ goal: GoalRecord | null; defaults?: GoalInputDefaults } | null>(startNew ? { goal: null } : null);
  const [openId, setOpenId] = useState<string | null>(initialOpen);

  useEffect(() => {
    const onNew = () => setEditing({ goal: null });
    window.addEventListener("lifeos:new-goal", onNew);
    return () => window.removeEventListener("lifeos:new-goal", onNew);
  }, []);

  const visible = useMemo(
    () => ws.goals.filter((g) => (filter === "all" ? true : filter === "done" ? g.status === "completed" || g.status === "abandoned" : g.status === "active" || g.status === "paused")),
    [ws.goals, filter],
  );
  const tree = useMemo(() => buildTree(visible), [visible]);
  const rows = flatten(tree);
  const open = openId ? ws.goals.find((g) => g.id === openId) ?? null : null;
  const counts = {
    active: ws.goals.filter((g) => g.status === "active" || g.status === "paused").length,
    done: ws.goals.filter((g) => g.status === "completed" || g.status === "abandoned").length,
    all: ws.goals.length,
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Which goals" className="flex rounded-md bg-muted p-0.5">
          {([["active", "In progress"], ["done", "Achieved & let go"], ["all", "All"]] as const).map(([f, label]) => (
            <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={cn("h-7 cursor-pointer rounded px-3 text-[13px] text-muted-foreground", filter === f && "bg-surface font-medium text-foreground shadow-card")}>
              {label} <span className="tabular text-[11px] text-subtle-foreground">{counts[f]}</span>
            </button>
          ))}
        </div>
        <Button size="sm" className="ml-auto" onClick={() => setEditing({ goal: null })}><Plus /> New goal</Button>
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={Target} title={ws.goals.length ? "Nothing here" : "No goals yet"} action={!ws.goals.length ? <Button size="sm" onClick={() => setEditing({ goal: null, defaults: { level: "vision" } })}><Plus /> Write your vision</Button> : undefined}>
            {ws.goals.length
              ? "Try another tab."
              : "Start broad with a vision of the life you want, then break it into goals for the next few years, this year and this quarter."}
          </EmptyState>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul role="tree" aria-label="Goals" className="divide-y divide-border">
            {rows.map((g) => <GoalRow key={g.id} g={g} ws={ws} onOpen={() => setOpenId(g.id)} onAddChild={() => setEditing({ goal: null, defaults: { parentId: g.id, level: childLevel(g) } })} />)}
          </ul>
        </Card>
      )}

      <p className="text-[11px] text-muted-foreground">
        Goals have no score or ranking. Pausing or letting one go is a normal part of planning and keeps it in your history.
      </p>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing?.goal ? "Edit goal" : "New goal"}</DialogTitle>
            <DialogDescription className="sr-only">Goal details</DialogDescription>
          </DialogHeader>
          {editing && <GoalForm goal={editing.goal} goals={ws.goals} categories={ws.categories} defaults={editing.defaults} onDone={() => setEditing(null)} onCancel={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-w-xl">
          {open && (
            <GoalDetail
              key={open.id + (open.metric_current ?? "")}
              goal={open}
              ws={ws}
              onEdit={() => { setOpenId(null); setEditing({ goal: open }); }}
              onClose={() => setOpenId(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function childLevel(g: GoalRecord): GoalRecord["level"] {
  return g.level === "vision" ? "long_term" : g.level === "long_term" ? "annual" : "quarterly";
}

function GoalProgress({ g, ws }: { g: GoalRecord; ws: GoalWorkspace }) {
  const m = metricPct(g);
  const ms = ws.milestones.filter((x) => x.goal_id === g.id);
  const mp = milestonePct(ms);
  if (m !== null) {
    return (
      <div className="grid gap-1">
        <Progress value={m} aria-label={`${m}% of target`} />
        <span className="tabular text-[11px] text-muted-foreground">
          {formatMetric(g.metric_current, ws.locale)} of {formatMetric(g.metric_target, ws.locale)} {g.metric_label} · {m}%
        </span>
      </div>
    );
  }
  if (mp !== null) {
    return (
      <div className="grid gap-1">
        <Progress value={mp} aria-label={`${mp}% of milestones reached`} indicatorClassName="bg-success" />
        <span className="tabular text-[11px] text-muted-foreground">{ms.filter((x) => x.completed_at).length} of {ms.length} milestones</span>
      </div>
    );
  }
  return null;
}

function GoalRow({ g, ws, onOpen, onAddChild }: { g: GoalNode; ws: GoalWorkspace; onOpen: () => void; onAddChild: () => void }) {
  const links = ws.links[g.id];
  const daysLeft = g.target_date ? diffDays(ws.today, g.target_date) : null;
  const dim = g.status !== "active";
  return (
    <li role="treeitem" aria-level={g.depth + 1} aria-selected={false} className="group">
      <div className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50" style={{ paddingLeft: `${16 + Math.min(g.depth, 4) * 20}px` }}>
        {g.depth > 0 && <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-subtle-foreground" aria-hidden />}
        <button type="button" onClick={onOpen} className="grid min-w-0 flex-1 cursor-pointer gap-1.5 text-left">
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={g.level === "vision" ? "brand" : "outline"}>{LEVEL_LABEL[g.level]}</Badge>
            <span className={cn("text-[14px] font-medium", g.level === "vision" && "text-[15px]", dim && "text-muted-foreground")}>{g.title}</span>
            {g.status !== "active" && <Badge variant={g.status === "completed" ? "success" : "default"}>{STATUS_LABEL[g.status]}</Badge>}
            <ProvenanceBadge source={g.source} />
          </span>
          <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-muted-foreground">
            {g.target_date && (
              <span className={cn(daysLeft !== null && daysLeft < 0 && g.status === "active" && "text-destructive")}>
                {daysLeft !== null && daysLeft >= 0 ? `${formatShortDate(g.target_date, ws.locale)} · ${daysLeft} days left` : `Target was ${formatShortDate(g.target_date, ws.locale)}`}
              </span>
            )}
            {links?.projects ? <span>{links.projects} project{links.projects > 1 ? "s" : ""}</span> : null}
            {links?.openTasks ? <span>{links.openTasks} open task{links.openTasks > 1 ? "s" : ""}</span> : null}
            {links?.habits ? <span>{links.habits} habit{links.habits > 1 ? "s" : ""}</span> : null}
            {links?.learning ? <span>{links.learning} learning item{links.learning > 1 ? "s" : ""}</span> : null}
          </span>
          <span className="max-w-md"><GoalProgress g={g} ws={ws} /></span>
        </button>
        {g.level !== "quarterly" && g.status === "active" && (
          <Button variant="ghost" size="sm" className="shrink-0 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 focus-visible:opacity-100" onClick={onAddChild} aria-label={`Sub-goal under ${g.title}`}>
            <Plus /> Sub-goal
          </Button>
        )}
      </div>
    </li>
  );
}

function GoalDetail({ goal, ws, onEdit, onClose }: { goal: GoalRecord; ws: GoalWorkspace; onEdit: () => void; onClose: () => void }) {
  const { pending, run } = useServerAction();
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const parent = goal.parent_id ? ws.goals.find((g) => g.id === goal.parent_id) : null;
  const children = ws.goals.filter((g) => g.parent_id === goal.id);
  const history = ws.progress.filter((p) => p.goal_id === goal.id).slice(0, 8);
  const category = ws.categories.find((c) => c.id === goal.wheel_category_id);
  const links = ws.links[goal.id];

  return (
    <div className="grid gap-5">
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{LEVEL_LABEL[goal.level]}</Badge>
          {goal.status !== "active" && <Badge>{STATUS_LABEL[goal.status]}</Badge>}
          {category && <Badge variant="default">{category.name}</Badge>}
        </div>
        <DialogTitle className="text-lg">{goal.title}</DialogTitle>
        <DialogDescription className={goal.why ? "" : "sr-only"}>{goal.why ?? "Goal details"}</DialogDescription>
      </DialogHeader>

      {parent && <p className="-mt-3 text-[12px] text-muted-foreground">Part of <span className="text-foreground">{parent.title}</span></p>}
      {goal.description && <p className="text-[13px] whitespace-pre-wrap">{goal.description}</p>}

      <GoalProgress g={goal} ws={ws} />

      {goal.metric_target !== null && goal.status === "active" && (
        <form
          className="grid gap-2"
          onSubmit={(e) => { e.preventDefault(); run(() => logGoalProgress(goal.id, value, note), { onSuccess: () => { setValue(""); setNote(""); } }); }}
        >
          <span className="flex items-center gap-1.5 text-[13px] font-medium"><TrendingUp className="size-3.5 text-muted-foreground" /> Log progress</span>
          <div className="flex flex-wrap gap-2">
            <Input className="w-32" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={goal.metric_label ?? "Value"} aria-label={`New value in ${goal.metric_label ?? "units"}`} />
            <Input className="min-w-40 flex-1" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" aria-label="Progress note" />
            <Button type="submit" variant="outline" disabled={pending || !value.trim()}>Log</Button>
          </div>
          {history.length > 0 && (
            <ul className="grid gap-0.5 text-[12px] text-muted-foreground">
              {history.map((h) => (
                <li key={h.id} className="flex gap-2"><span className="tabular w-24 shrink-0">{h.recorded_at.slice(0, 10)}</span><span className="tabular text-foreground">{formatMetric(h.value, ws.locale)}</span>{h.note && <span className="truncate">· {h.note}</span>}</li>
              ))}
            </ul>
          )}
        </form>
      )}

      <section className="grid gap-2">
        <h3 className="text-[13px] font-medium">Milestones</h3>
        <MilestoneList milestones={ws.milestones.filter((m) => m.goal_id === goal.id)} parent={{ goalId: goal.id }} today={ws.today} locale={ws.locale} />
      </section>

      {(children.length > 0 || links?.projects || links?.openTasks || links?.habits || links?.learning) && (
        <section className="grid gap-1.5 text-[13px]">
          <h3 className="font-medium">Connected</h3>
          {children.length > 0 && <p className="text-muted-foreground">Sub-goals: {children.map((c) => c.title).join(", ")}</p>}
          <div className="flex flex-wrap gap-2">
            {links?.projects ? <Button variant="outline" size="xs" asChild><Link href="/work">{links.projects} project{links.projects > 1 ? "s" : ""}</Link></Button> : null}
            {links?.openTasks ? <Button variant="outline" size="xs" asChild><Link href="/tasks?view=all">{links.openTasks} open task{links.openTasks > 1 ? "s" : ""}</Link></Button> : null}
            {links?.habits ? <Button variant="outline" size="xs" asChild><Link href="/habits">{links.habits} habit{links.habits > 1 ? "s" : ""}</Link></Button> : null}
            {links?.learning ? <Button variant="outline" size="xs" asChild><Link href="/learning">{links.learning} learning item{links.learning > 1 ? "s" : ""}</Link></Button> : null}
          </div>
        </section>
      )}

      <Separator />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={onEdit}><Pencil /> Edit</Button>
        {goal.status === "active" && (
          <>
            <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => setGoalStatus(goal.id, "completed"), { onSuccess: onClose })}><CheckCircle2 /> Achieved</Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => setGoalStatus(goal.id, "paused"), { onSuccess: onClose })}><Pause /> Pause</Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => setGoalStatus(goal.id, "abandoned"), { onSuccess: onClose })}><Ban /> Let go</Button>
          </>
        )}
        {goal.status !== "active" && (
          <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => setGoalStatus(goal.id, "active"), { onSuccess: onClose })}><Play /> Make active</Button>
        )}
        <span className="ml-auto">
          <ConfirmDelete
            title={`Delete “${goal.title}”?`}
            description={`This permanently deletes the goal, its milestones and progress log.${children.length ? ` Its ${children.length} sub-goal${children.length > 1 ? "s move" : " moves"} up a level.` : ""} Linked projects, tasks and habits are kept but unlinked. To keep a record, use “Let go” instead.`}
            confirmLabel="Delete goal"
            disabled={pending}
            onConfirm={() => run(() => deleteGoal(goal.id), { onSuccess: onClose })}
          />
        </span>
      </div>
    </div>
  );
}
