"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, BellRing, Dumbbell, Map as MapIcon, MoreHorizontal, Pencil, Plus, Timer, X } from "lucide-react";
import { ConfirmDelete } from "@/components/data/confirm-delete";
import { EmptyState } from "@/components/data/empty-state";
import { FormActions, useActionForm } from "@/components/data/action-form";
import { ProvenanceBadge } from "@/components/data/provenance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { addDays, formatShortDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { deleteRoadmap, saveRoadmap, setRoadmapArchived, setStepDone } from "@/server/actions/learning";
import { useServerAction } from "@/features/dashboard/use-server-action";
import { minutesBetween, mondayOf, nextStep, nextStudyDay, planLabel, plannedWeekMinutes, roadmapProgress } from "./plan";
import type { LearningWorkspace, Roadmap } from "./types";

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function RoadmapsTab({ ws, onEdit, onLog }: { ws: LearningWorkspace; onEdit: (r: Roadmap | null) => void; onLog: (r: Roadmap) => void }) {
  const { run, pending } = useServerAction();
  const [showArchived, setShowArchived] = useState(false);
  const active = ws.roadmaps.filter((r) => !r.archived_at);
  const archived = ws.roadmaps.filter((r) => r.archived_at);
  const weekFrom = mondayOf(ws.today);

  if (!ws.roadmaps.length) {
    return (
      <Card>
        <EmptyState icon={MapIcon} title="No roadmaps yet" action={<Button size="sm" onClick={() => onEdit(null)}><Plus /> Create a roadmap</Button>}>
          Break something you want to learn into steps and exercises, link the books and courses you&apos;ll use, and set a weekly study plan with reminders.
        </EmptyState>
      </Card>
    );
  }

  const list = showArchived ? archived : active;
  return (
    <div className="grid gap-4">
      {list.length === 0 && <p className="text-[13px] text-muted-foreground">{showArchived ? "No archived roadmaps." : "All your roadmaps are archived."}</p>}
      {list.map((r) => {
        const prog = roadmapProgress(r.steps);
        const up = nextStep(r.steps);
        const plan = planLabel(r);
        const planned = plannedWeekMinutes(r);
        const week = minutesBetween(ws.sessions.filter((s) => s.roadmap_id === r.id), weekFrom, ws.today);
        const next = nextStudyDay(r.study_days, ws.today);
        const goal = r.goal_id ? ws.goals.find((g) => g.id === r.goal_id) : null;
        const skill = r.skill_id ? ws.skills.find((x) => x.id === r.skill_id) : null;
        const overdue = r.target_date && r.target_date < ws.today && prog.done < prog.total;
        return (
          <Card key={r.id} className="grid gap-4 p-5">
            <div className="flex flex-wrap items-start gap-2">
              <div className="grid min-w-0 flex-1 basis-full gap-0.5 sm:basis-0">
                <h2 className="flex flex-wrap items-center gap-1.5 text-[15px] font-medium tracking-tight">
                  {r.title}
                  {r.archived_at && <Badge variant="outline">Archived</Badge>}
                  <ProvenanceBadge source={r.source} />
                </h2>
                <p className="text-[12px] text-muted-foreground">
                  {[skill ? `Skill: ${skill.name}` : null, goal ? `Goal: ${goal.title}` : null, r.target_date ? `${overdue ? "Was due" : "Target"} ${formatShortDate(r.target_date, ws.locale)}` : null].filter(Boolean).join(" · ") || r.description}
                </p>
              </div>
              {!r.archived_at && <Button size="sm" variant="outline" className="max-sm:mr-auto" onClick={() => onLog(r)}><Timer /> Log study</Button>}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`Options for ${r.title}`}><MoreHorizontal /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => onEdit(r)}><Pencil /> Edit</DropdownMenuItem>
                  <DropdownMenuItem disabled={pending} onSelect={() => run(() => setRoadmapArchived(r.id, !r.archived_at))}>
                    {r.archived_at ? <><ArchiveRestore /> Restore</> : <><Archive /> Archive</>}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <ConfirmDelete size="icon-sm" label={`Delete ${r.title}`} disabled={pending} title="Delete this roadmap?" description="Its steps and reminder are deleted. Study time you logged is kept." onConfirm={() => run(() => deleteRoadmap(r.id))} />
            </div>

            <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <div className="grid content-start gap-2">
                <div className="flex items-center gap-2 text-[12px]">
                  <Progress value={prog.pct} className="flex-1" aria-label={`${r.title} progress`} />
                  <span className="tabular text-muted-foreground">{prog.done}/{prog.total} steps</span>
                </div>
                {r.steps.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground">No steps yet. <button type="button" className="cursor-pointer underline underline-offset-2" onClick={() => onEdit(r)}>Add some</button>.</p>
                ) : (
                  <ol className="grid gap-1">
                    {r.steps.map((st) => {
                      const item = st.learning_item_id ? ws.items.find((i) => i.id === st.learning_item_id) : null;
                      return (
                        <li key={st.id} className={cn("flex items-start gap-2 rounded-lg px-1.5 py-1 text-[13px]", up?.id === st.id && "bg-muted/60")}>
                          <input
                            type="checkbox"
                            checked={!!st.done_at}
                            disabled={pending || !!r.archived_at}
                            onChange={(e) => run(() => setStepDone(st.id, e.target.checked), { quiet: true })}
                            aria-label={`${st.done_at ? "Mark not done" : "Mark done"}: ${st.title}`}
                            className="mt-0.5 size-4 shrink-0 accent-[var(--brand)]"
                          />
                          <span className="grid min-w-0 flex-1 gap-0.5">
                            <span className={cn("leading-snug", st.done_at && "text-muted-foreground line-through")}>
                              {st.title}
                              {st.is_exercise && <Badge variant="outline" className="ml-1.5 align-middle"><Dumbbell className="size-3" aria-hidden /> Exercise</Badge>}
                            </span>
                            {item && <span className="truncate text-[11px] text-muted-foreground">Uses: {item.title}{item.status === "in_progress" && item.progress_pct !== null ? ` · ${item.progress_pct}%` : ""}</span>}
                          </span>
                          {up?.id === st.id && <span className="text-[11px] font-medium text-brand">Up next</span>}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>

              <div className="grid content-start gap-2 rounded-xl border border-border p-3 text-[12px]">
                <h3 className="text-[13px] font-medium">Study plan</h3>
                {plan ? (
                  <>
                    <p>{plan}</p>
                    <p className="text-muted-foreground">
                      This week: <span className="tabular font-medium text-foreground">{week}</span>{planned ? ` of ${planned}` : ""} min
                      {next && !r.archived_at ? ` · next ${next === ws.today ? "today" : next === addDays(ws.today, 1) ? "tomorrow" : formatShortDate(next, ws.locale)}` : ""}
                    </p>
                    {planned ? <Progress value={Math.min(100, Math.round((week / planned) * 100))} aria-label="Study minutes this week against the plan" /> : null}
                    <p className="flex items-center gap-1 text-muted-foreground">
                      <BellRing className="size-3.5" aria-hidden />
                      {r.reminder ? (r.reminder.channels.includes("web_push") ? "Reminders on, also on your devices" : "Reminders on, in the app") : "No reminder"}
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground">No plan yet. <button type="button" className="cursor-pointer underline underline-offset-2" onClick={() => onEdit(r)}>Pick days and a time</button> to get reminders.</p>
                )}
              </div>
            </div>
          </Card>
        );
      })}
      {archived.length > 0 && (
        <Button variant="ghost" size="sm" className="w-fit" onClick={() => setShowArchived((x) => !x)}>
          {showArchived ? "Back to active roadmaps" : `Show archived (${archived.length})`}
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */

type StepRow = { id: string; title: string; isExercise: boolean; itemId: string };

export function RoadmapForm({ ws, roadmap, onDone, onCancel }: { ws: LearningWorkspace; roadmap: Roadmap | null; onDone: () => void; onCancel: () => void }) {
  const { v, set, err, pending, submit } = useActionForm(() => ({
    title: roadmap?.title ?? "",
    description: roadmap?.description ?? "",
    goalId: roadmap?.goal_id ?? "",
    skillId: roadmap?.skill_id ?? "",
    targetDate: roadmap?.target_date ?? "",
    studyDays: roadmap?.study_days ?? [],
    studyTime: roadmap?.study_time?.slice(0, 5) ?? "",
    studyMinutes: roadmap?.study_minutes?.toString() ?? "",
    remind: !!roadmap?.reminder,
    notifyDevices: roadmap?.reminder ? roadmap.reminder.channels.includes("web_push") : true,
    steps: (roadmap?.steps ?? []).map((s): StepRow => ({ id: s.id, title: s.title, isExercise: s.is_exercise, itemId: s.learning_item_id ?? "" })),
  }));
  const setStep = (i: number, patch: Partial<StepRow>) => set("steps", v.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= v.steps.length) return;
    const next = [...v.steps];
    [next[i], next[j]] = [next[j], next[i]];
    set("steps", next);
  };
  const activeItems = ws.items.filter((i) => i.status !== "dropped");

  return (
    <form noValidate className="grid gap-4" onSubmit={submit((x) => saveRoadmap(roadmap?.id ?? null, { ...x, steps: x.steps.filter((s) => s.title.trim()) }), onDone)}>
      <Field id="rm-title" label="What are you learning?" error={err("title")}>
        <Input id="rm-title" autoFocus value={v.title} maxLength={200} placeholder="Spanish to A2, Revit for construction drawings…" onChange={(e) => set("title", e.target.value)} aria-invalid={!!err("title")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="rm-skill" label="Skill" optional>
          <NativeSelect id="rm-skill" value={v.skillId} onChange={(e) => set("skillId", e.target.value)}>
            <option value="">None</option>
            {ws.skills.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </NativeSelect>
        </Field>
        <Field id="rm-goal" label="Goal" optional>
          <NativeSelect id="rm-goal" value={v.goalId} onChange={(e) => set("goalId", e.target.value)}>
            <option value="">None</option>
            {ws.goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </NativeSelect>
        </Field>
        <Field id="rm-target" label="Target date" optional>
          <Input id="rm-target" type="date" value={v.targetDate} onChange={(e) => set("targetDate", e.target.value)} />
        </Field>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-[13px] font-medium">Steps and exercises</legend>
        {v.steps.map((s, i) => (
          <div key={s.id || `new-${i}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-1.5 rounded-xl border border-border p-2 sm:grid-cols-[auto_minmax(0,1fr)_11rem_auto]">
            <div className="flex flex-col">
              <Button type="button" size="icon-sm" variant="ghost" className="size-5" aria-label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp /></Button>
              <Button type="button" size="icon-sm" variant="ghost" className="size-5" aria-label={`Move step ${i + 1} down`} disabled={i === v.steps.length - 1} onClick={() => move(i, 1)}><ArrowDown /></Button>
            </div>
            <div className="grid gap-1">
              <Input aria-label={`Step ${i + 1}`} value={s.title} maxLength={300} placeholder="What to do" onChange={(e) => setStep(i, { title: e.target.value })} className="h-8" />
              <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <input type="checkbox" checked={s.isExercise} onChange={(e) => setStep(i, { isExercise: e.target.checked })} className="size-3.5 accent-[var(--brand)]" />
                It&apos;s an exercise to practise
              </label>
            </div>
            <NativeSelect aria-label={`Step ${i + 1} uses`} value={s.itemId} onChange={(e) => setStep(i, { itemId: e.target.value })} className="h-8 max-sm:col-start-2">
              <option value="">No book or course</option>
              {activeItems.map((it) => <option key={it.id} value={it.id}>{it.title}</option>)}
            </NativeSelect>
            <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove step ${i + 1}`} className="max-sm:col-start-3 max-sm:row-start-1" onClick={() => set("steps", v.steps.filter((_, j) => j !== i))}><X /></Button>
          </div>
        ))}
        {err("steps") && <p className="text-xs text-destructive">{err("steps")}</p>}
        <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => set("steps", [...v.steps, { id: "", title: "", isExercise: false, itemId: "" }])}><Plus /> Add a step</Button>
      </fieldset>

      <div className="grid gap-3 rounded-2xl border border-border p-3">
        <span className="text-[13px] font-medium" id="rm-days">Study plan <span className="font-normal text-muted-foreground">(optional)</span></span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="rm-days">
          {WEEK_ORDER.map((d) => {
            const on = v.studyDays.includes(d);
            return (
              <button type="button" key={d} aria-pressed={on} onClick={() => set("studyDays", on ? v.studyDays.filter((x) => x !== d) : [...v.studyDays, d])}
                className={cn("h-8 w-11 cursor-pointer rounded-md border text-[12px]", on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted")}>
                {DAY_SHORT[d]}
              </button>
            );
          })}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="rm-time" label="At" optional error={err("studyTime")}>
            <Input id="rm-time" type="time" value={v.studyTime} onChange={(e) => set("studyTime", e.target.value)} aria-invalid={!!err("studyTime")} />
          </Field>
          <Field id="rm-minutes" label="Minutes per session" optional error={err("studyMinutes")}>
            <Input id="rm-minutes" inputMode="numeric" placeholder="30" value={v.studyMinutes} onChange={(e) => set("studyMinutes", e.target.value)} aria-invalid={!!err("studyMinutes")} />
          </Field>
        </div>
        <label className="flex items-center justify-between gap-3 text-[13px]">
          <span>
            Remind me to study
            <span className="block text-[11px] text-muted-foreground">On the days above at that time. Skipped once you&apos;ve logged study for this roadmap that day.</span>
          </span>
          <Switch checked={v.remind} onCheckedChange={(c) => set("remind", c)} aria-label="Remind me to study" />
        </label>
        {v.remind && (
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={v.notifyDevices} onChange={(e) => set("notifyDevices", e.target.checked)} className="size-4 accent-[var(--brand)]" />
            Also notify my devices
          </label>
        )}
      </div>

      <Field id="rm-desc" label="Notes" optional>
        <Textarea id="rm-desc" value={v.description} maxLength={5000} className="min-h-14" placeholder="Why it matters, resources, how you'll know you're there" onChange={(e) => set("description", e.target.value)} />
      </Field>
      <FormActions pending={pending} label={roadmap ? "Save changes" : "Create roadmap"} onCancel={onCancel} />
    </form>
  );
}
