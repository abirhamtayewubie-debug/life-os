"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { AREAS } from "@/features/tasks/types";
import { createProject, updateProject, type ProjectInput } from "@/server/actions/work";
import { useServerAction } from "@/features/dashboard/use-server-action";
import { PROJECT_STATUS_LABEL, type ProjectRecord, type WorkWorkspace } from "./types";

type Errors = Record<string, string[] | undefined>;

export function ProjectForm({ project, ws, onDone, onCancel }: { project: ProjectRecord | null; ws: WorkWorkspace; onDone: (id?: string) => void; onCancel: () => void }) {
  const [v, setV] = useState<ProjectInput>(() =>
    project
      ? {
          name: project.name, description: project.description ?? "", status: project.status, area: project.area as ProjectInput["area"],
          goalId: project.goal_id ?? "", startDate: project.start_date ?? "", dueDate: project.due_date ?? "",
          budgetAmount: project.budget_amount ? String(Number(project.budget_amount)) : "", budgetCurrency: project.budget_currency ?? ws.baseCurrency,
        }
      : { name: "", description: "", status: "active", area: "work", goalId: "", startDate: ws.today, dueDate: "", budgetAmount: "", budgetCurrency: ws.baseCurrency },
  );
  const [errors, setErrors] = useState<Errors>({});
  const { pending, run } = useServerAction();
  const set = <K extends keyof ProjectInput>(k: K, val: ProjectInput[K]) => setV((s) => ({ ...s, [k]: val }));
  const err = (k: string) => errors[k]?.[0];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    run(
      async () => {
        const r = project ? await updateProject(project.id, v) : await createProject(v);
        if (!r.ok && r.fieldErrors) setErrors(r.fieldErrors);
        return r;
      },
      { onSuccess: (r) => onDone((r.data as { id?: string } | undefined)?.id) },
    );
  };

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <Field id="project-name" label="Project" error={err("name")}>
        <Input id="project-name" autoFocus value={v.name} maxLength={160} onChange={(e) => set("name", e.target.value)} aria-invalid={!!err("name")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="project-status" label="Status">
          <NativeSelect id="project-status" value={v.status} onChange={(e) => set("status", e.target.value as ProjectInput["status"])}>
            {Object.entries(PROJECT_STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </NativeSelect>
        </Field>
        <Field id="project-area" label="Area">
          <NativeSelect id="project-area" value={v.area} onChange={(e) => set("area", e.target.value as ProjectInput["area"])}>
            {AREAS.map((a) => <option key={a} value={a}>{a[0].toUpperCase() + a.slice(1)}</option>)}
          </NativeSelect>
        </Field>
        <Field id="project-goal" label="Goal" optional>
          <NativeSelect id="project-goal" value={v.goalId ?? ""} onChange={(e) => set("goalId", e.target.value)}>
            <option value="">None</option>
            {ws.goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="project-start" label="Start" optional>
          <Input id="project-start" type="date" value={v.startDate ?? ""} onChange={(e) => set("startDate", e.target.value)} />
        </Field>
        <Field id="project-due" label="Due" optional error={err("dueDate")}>
          <Input id="project-due" type="date" value={v.dueDate ?? ""} min={v.startDate || undefined} onChange={(e) => set("dueDate", e.target.value)} aria-invalid={!!err("dueDate")} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <Field id="project-budget" label="Budget" optional error={err("budgetAmount")} hint="Spending you tag with this project in Finance counts against it.">
          <Input id="project-budget" inputMode="decimal" value={v.budgetAmount} onChange={(e) => set("budgetAmount", e.target.value)} aria-invalid={!!err("budgetAmount")} />
        </Field>
        <Field id="project-currency" label="Currency" error={err("budgetCurrency")}>
          <NativeSelect id="project-currency" value={v.budgetCurrency} onChange={(e) => set("budgetCurrency", e.target.value)}>
            {ws.currencies.map((c) => <option key={c} value={c}>{c}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <Field id="project-notes" label="Description" optional>
        <Textarea id="project-notes" value={v.description ?? ""} maxLength={5000} onChange={(e) => set("description", e.target.value)} className="min-h-16" />
      </Field>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : project ? "Save changes" : "Add project"}</Button>
      </div>
    </form>
  );
}
