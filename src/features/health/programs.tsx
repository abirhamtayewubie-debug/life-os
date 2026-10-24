"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, ClipboardList, MoreHorizontal, Pencil, Play, Plus, Trash2, X } from "lucide-react";
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
import { formatShortDate } from "@/lib/dates";
import { deleteProgram, saveProgram, setProgramArchived } from "@/server/actions/health";
import { useServerAction } from "@/features/dashboard/use-server-action";
import type { SetRow, WorkoutStart } from "./forms";
import { lastSetFor } from "./records";
import { programDays, type HealthWorkspace, type ProgramExercise, type WorkoutProgram } from "./types";

const reps = (e: Pick<ProgramExercise, "reps_min" | "reps_max">) =>
  e.reps_min !== null && e.reps_max !== null && e.reps_min !== e.reps_max ? `${e.reps_min}–${e.reps_max}` : (e.reps_max ?? e.reps_min)?.toString() ?? null;

/** Pre-fills a workout from a program day: target sets and reps, starting from what was lifted last time if there is a history. */
export function startFromDay(ws: HealthWorkspace, p: WorkoutProgram, day: string): WorkoutStart {
  const unit = ws.system === "imperial" ? "lb" : "kg";
  const sets: SetRow[] = [];
  for (const e of p.exercises.filter((x) => x.day_label === day)) {
    const last = lastSetFor(ws.exerciseLog, e.exercise);
    const weight = last?.weight ? String(Number(last.weight)) : e.target_weight ? String(Number(e.target_weight)) : "";
    const u = (last?.weight ? last.weight_unit : e.weight_unit) ?? unit;
    for (let i = 0; i < e.target_sets; i++) {
      sets.push({ exercise: e.exercise, reps: (e.reps_max ?? e.reps_min)?.toString() ?? "", weight, unit: u, seconds: "", km: "" });
    }
  }
  return { programId: p.id, day, activity: `${p.name} · ${day}`, goalId: p.goal_id, sets };
}

export function ProgramsTab({ ws, onStart, onEdit }: { ws: HealthWorkspace; onStart: (s: WorkoutStart) => void; onEdit: (p: WorkoutProgram | null) => void }) {
  const { run, pending } = useServerAction();
  const [showArchived, setShowArchived] = useState(false);
  const active = ws.programs.filter((p) => !p.archived_at);
  const archived = ws.programs.filter((p) => p.archived_at);
  const lastDone = (programId: string, day: string) => ws.workouts.find((w) => w.program_id === programId && w.program_day === day)?.performed_on;

  if (!ws.programs.length) {
    return (
      <Card>
        <EmptyState icon={ClipboardList} title="No programs yet" action={<Button size="sm" onClick={() => onEdit(null)}><Plus /> Create a program</Button>}>
          Write your plan once: days like &ldquo;Push&rdquo; or &ldquo;Day A&rdquo;, each with exercises, sets and rep targets. Then start a day and the workout is filled in for you.
        </EmptyState>
      </Card>
    );
  }

  const list = showArchived ? archived : active;
  return (
    <div className="grid gap-4">
      {list.length === 0 && <p className="text-[13px] text-muted-foreground">{showArchived ? "No archived programs." : "All your programs are archived."}</p>}
      {list.map((p) => {
        const days = programDays(p);
        const goal = p.goal_id ? ws.goals.find((g) => g.id === p.goal_id) : null;
        return (
          <Card key={p.id} className="grid gap-4 p-5">
            <div className="flex flex-wrap items-start gap-2">
              <div className="grid min-w-0 flex-1 gap-0.5">
                <h2 className="flex flex-wrap items-center gap-1.5 text-[15px] font-medium tracking-tight">
                  {p.name}
                  {p.archived_at && <Badge variant="outline">Archived</Badge>}
                  <ProvenanceBadge source={p.source} />
                </h2>
                {(p.description || goal) && <p className="text-[12px] text-muted-foreground">{[p.description, goal ? `Goal: ${goal.title}` : null].filter(Boolean).join(" · ")}</p>}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`Options for ${p.name}`}><MoreHorizontal /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => onEdit(p)}><Pencil /> Edit</DropdownMenuItem>
                  <DropdownMenuItem disabled={pending} onSelect={() => run(() => setProgramArchived(p.id, !p.archived_at))}>
                    {p.archived_at ? <><ArchiveRestore /> Restore</> : <><Archive /> Archive</>}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <ConfirmDelete size="icon-sm" label={`Delete ${p.name}`} disabled={pending} title="Delete this program?" description="The plan is deleted. Workouts you logged from it are kept." onConfirm={() => run(() => deleteProgram(p.id))} />
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {days.map((d) => {
                const done = lastDone(p.id, d.label);
                return (
                  <div key={d.label} className="grid content-start gap-2 rounded-xl border border-border p-3">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[13px] font-medium">{d.label}</h3>
                      <span className="text-[11px] text-muted-foreground">{done ? `Last done ${formatShortDate(done, ws.locale)}` : "Not done yet"}</span>
                      {!p.archived_at && (
                        <Button size="sm" variant="outline" className="ml-auto" onClick={() => onStart(startFromDay(ws, p, d.label))} aria-label={`Start ${p.name}, ${d.label}`}><Play /> Start</Button>
                      )}
                    </div>
                    <ol className="grid gap-1 text-[12px]">
                      {d.exercises.map((e) => (
                        <li key={e.id} className="flex gap-2">
                          <span className="min-w-0 flex-1 truncate">{e.exercise}</span>
                          <span className="tabular text-muted-foreground">
                            {[`${e.target_sets}×${reps(e) ?? ""}`.replace(/×$/, " sets"), e.target_weight ? `${Number(e.target_weight)} ${e.weight_unit}` : null, e.rest_seconds ? `rest ${e.rest_seconds}s` : null].filter(Boolean).join(" · ")}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
      {archived.length > 0 && (
        <Button variant="ghost" size="sm" className="w-fit" onClick={() => setShowArchived((x) => !x)}>
          {showArchived ? "Back to active programs" : `Show archived (${archived.length})`}
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */

type Row = { exercise: string; sets: string; repsMin: string; repsMax: string; weight: string; unit: "kg" | "lb"; rest: string };
type Day = { label: string; rows: Row[] };

export function ProgramForm({ ws, program, onDone, onCancel }: { ws: HealthWorkspace; program: WorkoutProgram | null; onDone: () => void; onCancel: () => void }) {
  const unit = ws.system === "imperial" ? "lb" : "kg";
  const blank = (): Row => ({ exercise: "", sets: "3", repsMin: "", repsMax: "", weight: "", unit, rest: "" });
  const { v, set, err, pending, submit } = useActionForm(() => ({
    name: program?.name ?? "",
    description: program?.description ?? "",
    goalId: program?.goal_id ?? "",
    days: program
      ? programDays(program).map((d): Day => ({
        label: d.label,
        rows: d.exercises.map((e) => ({
          exercise: e.exercise, sets: String(e.target_sets), repsMin: e.reps_min?.toString() ?? "", repsMax: e.reps_max?.toString() ?? "",
          weight: e.target_weight ? String(Number(e.target_weight)) : "", unit: e.weight_unit ?? unit, rest: e.rest_seconds?.toString() ?? "",
        })),
      }))
      : [{ label: "Day A", rows: [blank()] }],
  }));
  const setDay = (i: number, patch: Partial<Day>) => set("days", v.days.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const setRow = (i: number, r: number, patch: Partial<Row>) => setDay(i, { rows: v.days[i].rows.map((x, k) => (k === r ? { ...x, ...patch } : x)) });
  const nextLabel = () => `Day ${String.fromCharCode(65 + v.days.length)}`;

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={submit((x) => saveProgram(program?.id ?? null, {
        name: x.name, description: x.description, goalId: x.goalId,
        exercises: x.days.flatMap((d) => d.rows.filter((r) => r.exercise.trim()).map((r) => ({ day: d.label, ...r }))),
      }), onDone)}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <Field id="pg-name" label="Name" error={err("name")}>
          <Input id="pg-name" autoFocus value={v.name} maxLength={80} placeholder="Full body, Push/Pull/Legs…" onChange={(e) => set("name", e.target.value)} aria-invalid={!!err("name")} />
        </Field>
        {ws.goals.length > 0 && (
          <Field id="pg-goal" label="Goal" optional>
            <NativeSelect id="pg-goal" value={v.goalId} onChange={(e) => set("goalId", e.target.value)}>
              <option value="">None</option>
              {ws.goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
            </NativeSelect>
          </Field>
        )}
      </div>
      <Field id="pg-desc" label="Notes" optional>
        <Textarea id="pg-desc" value={v.description} maxLength={2000} className="min-h-9" placeholder="How to progress, what to watch for" onChange={(e) => set("description", e.target.value)} />
      </Field>

      {v.days.map((d, i) => (
        <fieldset key={i} className="grid gap-2 rounded-xl border border-border p-3">
          <legend className="sr-only">{d.label || `Day ${i + 1}`}</legend>
          <div className="flex items-center gap-2">
            <Input aria-label={`Day ${i + 1} name`} value={d.label} maxLength={40} onChange={(e) => setDay(i, { label: e.target.value })} className="h-8 max-w-48 font-medium" />
            {v.days.length > 1 && (
              <Button type="button" size="icon-sm" variant="ghost" className="ml-auto" aria-label={`Remove ${d.label || `day ${i + 1}`}`} onClick={() => set("days", v.days.filter((_, j) => j !== i))}><Trash2 /></Button>
            )}
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_3.25rem_3.25rem_3.25rem_4.5rem_auto] gap-1.5 text-[11px] text-muted-foreground max-sm:hidden" aria-hidden>
            <span>Exercise</span><span>Sets</span><span>Reps</span><span>to</span><span>{unit}</span><span className="w-7" />
          </div>
          {d.rows.map((r, k) => (
            <div key={k} className="grid grid-cols-[minmax(0,1fr)_3.25rem_3.25rem_3.25rem_4.5rem_auto] items-center gap-1.5 max-sm:grid-cols-[minmax(0,1fr)_3rem_3rem_3rem_auto]">
              <Input aria-label={`${d.label} exercise ${k + 1}`} placeholder="Exercise" value={r.exercise} maxLength={80} onChange={(e) => setRow(i, k, { exercise: e.target.value })} className="h-8" />
              <Input aria-label={`${d.label} exercise ${k + 1} sets`} inputMode="numeric" value={r.sets} onChange={(e) => setRow(i, k, { sets: e.target.value })} className="h-8" />
              <Input aria-label={`${d.label} exercise ${k + 1} reps from`} placeholder="8" inputMode="numeric" value={r.repsMin} onChange={(e) => setRow(i, k, { repsMin: e.target.value })} className="h-8" />
              <Input aria-label={`${d.label} exercise ${k + 1} reps to`} placeholder="12" inputMode="numeric" value={r.repsMax} onChange={(e) => setRow(i, k, { repsMax: e.target.value })} className="h-8" />
              <Input aria-label={`${d.label} exercise ${k + 1} weight (${r.unit})`} placeholder={r.unit} inputMode="decimal" value={r.weight} onChange={(e) => setRow(i, k, { weight: e.target.value })} className="h-8 max-sm:hidden" />
              <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove ${r.exercise || `exercise ${k + 1}`}`} onClick={() => setDay(i, { rows: d.rows.filter((_, j) => j !== k) })}><X /></Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="ghost" className="w-fit" onClick={() => setDay(i, { rows: [...d.rows, blank()] })}><Plus /> Exercise</Button>
        </fieldset>
      ))}
      {err("exercises") && <p className="text-xs text-destructive">{err("exercises")}</p>}
      <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => set("days", [...v.days, { label: nextLabel(), rows: [blank()] }])}><Plus /> Add a day</Button>
      <FormActions pending={pending} label={program ? "Save changes" : "Create program"} onCancel={onCancel} />
    </form>
  );
}
