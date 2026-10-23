"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { createGoal, updateGoal, type GoalInput } from "@/server/actions/goals";
import { useServerAction } from "@/features/dashboard/use-server-action";
import { allowedParents } from "./tree";
import { LEVELS, LEVEL_LABEL, type GoalRecord } from "./types";

type Errors = Record<string, string[] | undefined>;

export function GoalForm({
  goal, goals, categories, defaults = {}, onDone, onCancel,
}: {
  goal: GoalRecord | null;
  goals: GoalRecord[];
  categories: { id: string; name: string }[];
  defaults?: Partial<GoalInput>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState<GoalInput>(() =>
    goal
      ? {
          title: goal.title, level: goal.level, parentId: goal.parent_id ?? "", wheelCategoryId: goal.wheel_category_id ?? "",
          description: goal.description ?? "", why: goal.why ?? "", targetDate: goal.target_date ?? "",
          metricLabel: goal.metric_label ?? "", metricTarget: goal.metric_target ? String(Number(goal.metric_target)) : "",
          metricCurrent: goal.metric_current ? String(Number(goal.metric_current)) : "",
        }
      : { title: "", level: "annual", parentId: "", wheelCategoryId: "", description: "", why: "", targetDate: "", metricLabel: "", metricTarget: "", metricCurrent: "", ...defaults },
  );
  const [errors, setErrors] = useState<Errors>({});
  const { pending, run } = useServerAction();
  const set = <K extends keyof GoalInput>(k: K, val: GoalInput[K]) => setV((s) => ({ ...s, [k]: val }));
  const err = (k: string) => errors[k]?.[0];
  const parents = allowedParents(goal, v.level, goals);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    run(
      async () => {
        const r = goal ? await updateGoal(goal.id, v) : await createGoal(v);
        if (!r.ok && r.fieldErrors) setErrors(r.fieldErrors);
        return r;
      },
      { onSuccess: onDone },
    );
  };

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <Field id="goal-title" label="Goal" error={err("title")}>
        <Input id="goal-title" autoFocus value={v.title} maxLength={200} onChange={(e) => set("title", e.target.value)} aria-invalid={!!err("title")} placeholder="What do you want to be true?" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="goal-level" label="Horizon">
          <NativeSelect
            id="goal-level"
            value={v.level}
            onChange={(e) => {
              const level = e.target.value as GoalInput["level"];
              // Drop a parent that would no longer be broader than this goal.
              setV((s) => ({ ...s, level, parentId: allowedParents(goal, level, goals).some((p) => p.id === s.parentId) ? s.parentId : "" }));
            }}
          >
            {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
          </NativeSelect>
        </Field>
        <Field id="goal-parent" label="Part of" optional error={err("parentId")}>
          <NativeSelect id="goal-parent" value={v.parentId ?? ""} onChange={(e) => set("parentId", e.target.value)} disabled={!parents.length}>
            <option value="">{parents.length ? "Nothing (top level)" : "No broader goals yet"}</option>
            {parents.map((p) => <option key={p.id} value={p.id}>{LEVEL_LABEL[p.level]}: {p.title}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <Field id="goal-why" label="Why it matters" optional>
        <Textarea id="goal-why" value={v.why ?? ""} maxLength={2000} onChange={(e) => set("why", e.target.value)} className="min-h-14" placeholder="The reason you'll come back to on hard days." />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="goal-date" label="Target date" optional error={err("targetDate")}>
          <Input id="goal-date" type="date" value={v.targetDate ?? ""} onChange={(e) => set("targetDate", e.target.value)} />
        </Field>
        <Field id="goal-area" label="Life area" optional>
          <NativeSelect id="goal-area" value={v.wheelCategoryId ?? ""} onChange={(e) => set("wheelCategoryId", e.target.value)}>
            <option value="">None</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <fieldset className="grid gap-3 rounded-2xl border border-border p-3">
        <legend className="px-1 text-[13px] font-medium">Measure it <span className="font-normal text-muted-foreground">(optional)</span></legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="goal-metric-label" label="Unit" error={err("metricLabel")}>
            <Input id="goal-metric-label" value={v.metricLabel ?? ""} maxLength={60} onChange={(e) => set("metricLabel", e.target.value)} placeholder="km, ETB, sessions" aria-invalid={!!err("metricLabel")} />
          </Field>
          <Field id="goal-metric-target" label="Target" error={err("metricTarget")}>
            <Input id="goal-metric-target" inputMode="decimal" value={v.metricTarget ?? ""} onChange={(e) => set("metricTarget", e.target.value)} aria-invalid={!!err("metricTarget")} />
          </Field>
          <Field id="goal-metric-current" label="Now" error={err("metricCurrent")}>
            <Input id="goal-metric-current" inputMode="decimal" value={v.metricCurrent ?? ""} onChange={(e) => set("metricCurrent", e.target.value)} aria-invalid={!!err("metricCurrent")} />
          </Field>
        </div>
        <p className="text-[11px] text-muted-foreground">Leave blank for goals that aren&apos;t about a number. Milestones can track those instead.</p>
      </fieldset>
      <Field id="goal-notes" label="Notes" optional>
        <Textarea id="goal-notes" value={v.description ?? ""} maxLength={5000} onChange={(e) => set("description", e.target.value)} className="min-h-14" />
      </Field>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : goal ? "Save changes" : "Add goal"}</Button>
      </div>
    </form>
  );
}
