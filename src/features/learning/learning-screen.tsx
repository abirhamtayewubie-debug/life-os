"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, ExternalLink, GraduationCap, Pencil, Plus, Timer } from "lucide-react";
import { ConfirmDelete } from "@/components/data/confirm-delete";
import { EmptyState } from "@/components/data/empty-state";
import { ProvenanceBadge } from "@/components/data/provenance";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { formatShortDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { deleteLearningItem, deleteSkill, saveLearningItem, saveSkill, updateLearningProgress, type LearningItemInput, type SkillInput } from "@/server/actions/learning";
import { useServerAction } from "@/features/dashboard/use-server-action";
import { AREAS } from "@/features/tasks/types";
import { RoadmapForm, RoadmapsTab } from "./roadmaps";
import { SessionForm, SessionsTab } from "./sessions";
import { LEARNING_KIND_LABEL, LEARNING_STATUS_LABEL, SKILL_LEVEL_LABEL, type LearningItem, type LearningKind, type LearningStatus, type LearningWorkspace, type Roadmap, type Skill } from "./types";

type Errors = Record<string, string[] | undefined>;
const GROUPS: LearningStatus[] = ["in_progress", "planned", "completed", "dropped"];

export type LearningTab = "library" | "roadmaps" | "sessions";
const TABS: { v: LearningTab; label: string }[] = [
  { v: "library", label: "Library & skills" },
  { v: "roadmaps", label: "Roadmaps" },
  { v: "sessions", label: "Study log" },
];

export function LearningScreen({ ws, tab = "library", startNew = false }: { ws: LearningWorkspace; tab?: LearningTab; startNew?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [editing, setEditing] = useState<LearningItem | "new" | null>(startNew && tab === "library" ? "new" : null);
  const [skill, setSkill] = useState<Skill | "new" | null>(null);
  const [roadmap, setRoadmap] = useState<Roadmap | "new" | null>(startNew && tab === "roadmaps" ? "new" : null);
  const [logFor, setLogFor] = useState<Roadmap | "any" | null>(startNew && tab === "sessions" ? "any" : null);
  const [showDropped, setShowDropped] = useState(false);

  useEffect(() => {
    const onNew = () => setEditing("new");
    window.addEventListener("lifeos:new-learning", onNew);
    return () => window.removeEventListener("lifeos:new-learning", onNew);
  }, []);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="-mx-1 max-w-full overflow-x-auto px-1">
          <div role="tablist" aria-label="Learning views" className="flex w-max rounded-md bg-muted p-0.5">
            {TABS.map((t) => (
              <button key={t.v} role="tab" aria-selected={tab === t.v} onClick={() => router.replace(t.v === "library" ? pathname : `${pathname}?tab=${t.v}`, { scroll: false })}
                className={cn("h-7 cursor-pointer rounded px-3 text-[13px] whitespace-nowrap text-muted-foreground", tab === t.v && "bg-surface font-medium text-foreground shadow-card")}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          {tab === "library" ? <Button size="sm" onClick={() => setEditing("new")}><Plus /> Add</Button>
            : tab === "roadmaps" ? <Button size="sm" onClick={() => setRoadmap("new")}><Plus /> Roadmap</Button>
            : <Button size="sm" onClick={() => setLogFor("any")}><Timer /> Log study</Button>}
        </div>
      </div>

      {tab === "roadmaps" ? <RoadmapsTab ws={ws} onEdit={(r) => setRoadmap(r ?? "new")} onLog={(r) => setLogFor(r)} />
        : tab === "sessions" ? <SessionsTab ws={ws} onLog={() => setLogFor("any")} />
        : (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4">
        <p className="text-[13px] text-muted-foreground">
          {ws.items.filter((i) => i.status === "in_progress").length} in progress · {ws.items.filter((i) => i.status === "completed").length} finished
        </p>
        {!ws.items.length ? (
          <Card>
            <EmptyState icon={BookOpen} title="Nothing on your learning list" action={<Button size="sm" onClick={() => setEditing("new")}><Plus /> Add a book or course</Button>}>
              Track books, courses, videos and practice. Link them to a goal to see them there too.
            </EmptyState>
          </Card>
        ) : (
          GROUPS.map((g) => {
            const items = ws.items.filter((i) => i.status === g);
            if (!items.length) return null;
            if (g === "dropped" && !showDropped) return <button key={g} type="button" className="w-fit cursor-pointer text-[12px] text-muted-foreground hover:text-foreground" onClick={() => setShowDropped(true)}>Show {items.length} dropped</button>;
            return (
              <section key={g} aria-labelledby={`group-${g}`} className="grid gap-2">
                <h2 id={`group-${g}`} className="text-[12px] font-medium text-muted-foreground">{LEARNING_STATUS_LABEL[g]} <span className="tabular">{items.length}</span></h2>
                <ul className="grid gap-2">{items.map((i) => <ItemRow key={i.id} item={i} ws={ws} onEdit={() => setEditing(i)} />)}</ul>
              </section>
            );
          })
        )}
      </div>

      <Card className="h-fit">
        <CardHeader>
          <div>
            <CardTitle>Skills</CardTitle>
            <CardDescription>Your own rating, 1 to 5, and where you&apos;re aiming.</CardDescription>
          </div>
          <Button size="icon-sm" variant="ghost" aria-label="Add a skill" onClick={() => setSkill("new")}><Plus /></Button>
        </CardHeader>
        <CardContent>
          {!ws.skills.length ? (
            <EmptyState compact icon={GraduationCap} title="No skills yet" action={<Button size="sm" variant="outline" onClick={() => setSkill("new")}>Add a skill</Button>} />
          ) : (
            <ul className="grid gap-3">
              {ws.skills.map((s) => (
                <li key={s.id} className="grid gap-1">
                  <div className="flex items-center gap-2">
                    <button type="button" className="min-w-0 flex-1 cursor-pointer truncate text-left text-[13px] font-medium hover:underline" onClick={() => setSkill(s)}>{s.name}</button>
                    <ProvenanceBadge source={s.source} />
                  </div>
                  <LevelDots level={s.level} target={s.target_level} />
                  <p className="text-[11px] text-muted-foreground">
                    {s.level ? SKILL_LEVEL_LABEL[s.level] : "Not rated"}{s.target_level && s.target_level !== s.level ? ` · aiming for ${SKILL_LEVEL_LABEL[s.target_level]}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
        )}

      <Dialog open={roadmap !== null} onOpenChange={(o) => !o && setRoadmap(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{roadmap === "new" ? "New roadmap" : "Edit roadmap"}</DialogTitle>
            <DialogDescription>Steps and exercises in order, the books or courses they use, and when you&apos;ll study.</DialogDescription>
          </DialogHeader>
          {roadmap !== null && <RoadmapForm ws={ws} roadmap={roadmap === "new" ? null : roadmap} onDone={() => setRoadmap(null)} onCancel={() => setRoadmap(null)} />}
        </DialogContent>
      </Dialog>
      <Dialog open={logFor !== null} onOpenChange={(o) => !o && setLogFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log study</DialogTitle>
            <DialogDescription>Time spent studying or practising.</DialogDescription>
          </DialogHeader>
          {logFor !== null && <SessionForm ws={ws} roadmap={logFor === "any" ? null : logFor} onDone={() => setLogFor(null)} onCancel={() => setLogFor(null)} />}
        </DialogContent>
      </Dialog>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Add to your learning" : "Edit"}</DialogTitle>
            <DialogDescription>A book, course, video or anything you&apos;re practising.</DialogDescription>
          </DialogHeader>
          {editing !== null && <ItemForm item={editing === "new" ? null : editing} ws={ws} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
      <Dialog open={skill !== null} onOpenChange={(o) => !o && setSkill(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{skill === "new" ? "Add a skill" : "Edit skill"}</DialogTitle>
            <DialogDescription>Rate yourself honestly. Nobody else sees this.</DialogDescription>
          </DialogHeader>
          {skill !== null && <SkillForm skill={skill === "new" ? null : skill} onDone={() => setSkill(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LevelDots({ level, target }: { level: number | null; target: number | null }) {
  return (
    <div className="flex gap-1" role="img" aria-label={`Level ${level ?? "not rated"} of 5${target ? `, target ${target}` : ""}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={cn("h-1.5 flex-1 rounded-full bg-muted", level && n <= level && "bg-brand", !(level && n <= level) && target && n <= target && "bg-brand/25")} />
      ))}
    </div>
  );
}

function ItemRow({ item, ws, onEdit }: { item: LearningItem; ws: LearningWorkspace; onEdit: () => void }) {
  const { pending, run } = useServerAction();
  const [pct, setPct] = useState(String(item.progress_pct ?? ""));
  const goal = ws.goals.find((g) => g.id === item.goal_id);
  const commit = () => {
    const n = Number(pct);
    if (pct === "" || !Number.isInteger(n) || n === item.progress_pct) return;
    run(() => updateLearningProgress(item.id, Math.max(0, Math.min(100, n))));
  };
  return (
    <li>
      <Card className="p-3.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className={cn("text-[14px] font-medium leading-snug", item.status === "dropped" && "text-muted-foreground line-through")}>{item.title}</p>
            <p className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[12px] text-muted-foreground">
              <span>{LEARNING_KIND_LABEL[item.kind]}</span>
              {item.author && <span>{item.author}</span>}
              {item.finished_on ? <span>Finished {formatShortDate(item.finished_on, ws.locale)}</span> : item.started_on && <span>Started {formatShortDate(item.started_on, ws.locale)}</span>}
              {goal && <Link href="/goals" className="hover:underline">Goal: {goal.title}</Link>}
            </p>
          </div>
          <ProvenanceBadge source={item.source} />
          {item.url && <Button asChild variant="ghost" size="icon-sm"><a href={item.url} target="_blank" rel="noopener noreferrer" aria-label="Open link"><ExternalLink /></a></Button>}
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${item.title}`} onClick={onEdit}><Pencil /></Button>
          <ConfirmDelete size="icon-sm" title={`Delete “${item.title}”?`} description="It will be removed from your learning list." confirmLabel="Delete" disabled={pending} onConfirm={() => run(() => deleteLearningItem(item.id))} label={`Delete ${item.title}`} />
        </div>
        {item.status === "in_progress" && (
          <form className="mt-2.5 flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); commit(); }}>
            <Progress value={item.progress_pct ?? 0} className="flex-1" aria-label="Progress" />
            <Input aria-label={`Progress for ${item.title}, percent`} inputMode="numeric" value={pct} onChange={(e) => setPct(e.target.value.replace(/\D/g, "").slice(0, 3))} onBlur={commit} disabled={pending} className="h-7 w-14 text-right text-[12px] tabular" placeholder="—" />
            <span className="text-[12px] text-muted-foreground">%</span>
          </form>
        )}
        {item.notes && <p className="mt-2 line-clamp-3 text-[12px] whitespace-pre-wrap text-muted-foreground">{item.notes}</p>}
      </Card>
    </li>
  );
}

function ItemForm({ item, ws, onDone }: { item: LearningItem | null; ws: LearningWorkspace; onDone: () => void }) {
  const [v, setV] = useState<LearningItemInput>(() => ({
    kind: item?.kind ?? "book", title: item?.title ?? "", author: item?.author ?? "", url: item?.url ?? "", status: item?.status ?? "planned",
    progress: item?.progress_pct ?? "", startedOn: item?.started_on ?? "", finishedOn: item?.finished_on ?? "", goalId: item?.goal_id ?? "", notes: item?.notes ?? "",
  }));
  const [errors, setErrors] = useState<Errors>({});
  const { pending, run } = useServerAction();
  const set = <K extends keyof LearningItemInput>(k: K, val: LearningItemInput[K]) => setV((s) => ({ ...s, [k]: val }));
  const err = (k: string) => errors[k]?.[0];
  return (
    <form noValidate className="grid gap-4" onSubmit={(e) => {
      e.preventDefault();
      setErrors({});
      run(async () => {
        const r = await saveLearningItem(item?.id ?? null, v);
        if (!r.ok && r.fieldErrors) setErrors(r.fieldErrors);
        return r;
      }, { onSuccess: onDone });
    }}>
      <Field id="learn-title" label="Title" error={err("title")}>
        <Input id="learn-title" autoFocus value={v.title} maxLength={300} onChange={(e) => set("title", e.target.value)} aria-invalid={!!err("title")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="learn-kind" label="Type">
          <NativeSelect id="learn-kind" value={v.kind} onChange={(e) => set("kind", e.target.value as LearningKind)}>
            {Object.entries(LEARNING_KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </NativeSelect>
        </Field>
        <Field id="learn-status" label="Status">
          <NativeSelect id="learn-status" value={v.status} onChange={(e) => set("status", e.target.value as LearningStatus)}>
            {Object.entries(LEARNING_STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </NativeSelect>
        </Field>
        <Field id="learn-progress" label="Progress %" optional error={err("progress")}>
          <Input id="learn-progress" inputMode="numeric" value={String(v.progress ?? "")} onChange={(e) => set("progress", e.target.value)} aria-invalid={!!err("progress")} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="learn-author" label="Author or teacher" optional>
          <Input id="learn-author" value={v.author ?? ""} maxLength={200} onChange={(e) => set("author", e.target.value)} />
        </Field>
        <Field id="learn-goal" label="Goal" optional>
          <NativeSelect id="learn-goal" value={v.goalId ?? ""} onChange={(e) => set("goalId", e.target.value)}>
            <option value="">None</option>
            {ws.goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="learn-start" label="Started" optional>
          <Input id="learn-start" type="date" max={ws.today} value={v.startedOn ?? ""} onChange={(e) => set("startedOn", e.target.value)} />
        </Field>
        <Field id="learn-finish" label="Finished" optional error={err("finishedOn")}>
          <Input id="learn-finish" type="date" max={ws.today} min={v.startedOn || undefined} value={v.finishedOn ?? ""} onChange={(e) => set("finishedOn", e.target.value)} aria-invalid={!!err("finishedOn")} />
        </Field>
      </div>
      <Field id="learn-url" label="Link" optional error={err("url")}>
        <Input id="learn-url" type="url" placeholder="https://" value={v.url ?? ""} onChange={(e) => set("url", e.target.value)} aria-invalid={!!err("url")} />
      </Field>
      <Field id="learn-notes" label="Notes" optional>
        <Textarea id="learn-notes" value={v.notes ?? ""} maxLength={10000} onChange={(e) => set("notes", e.target.value)} className="min-h-20" />
      </Field>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : item ? "Save changes" : "Add"}</Button>
      </div>
    </form>
  );
}

function SkillForm({ skill, onDone }: { skill: Skill | null; onDone: () => void }) {
  const [v, setV] = useState<SkillInput>(() => ({ name: skill?.name ?? "", area: skill?.area ?? "learning", level: skill?.level ?? "", targetLevel: skill?.target_level ?? "", notes: skill?.notes ?? "" }));
  const [errors, setErrors] = useState<Errors>({});
  const { pending, run } = useServerAction();
  const set = <K extends keyof SkillInput>(k: K, val: SkillInput[K]) => setV((s) => ({ ...s, [k]: val }));
  const levels = (
    <>
      <option value="">Not set</option>
      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} · {SKILL_LEVEL_LABEL[n]}</option>)}
    </>
  );
  return (
    <form noValidate className="grid gap-4" onSubmit={(e) => {
      e.preventDefault();
      setErrors({});
      run(async () => {
        const r = await saveSkill(skill?.id ?? null, v);
        if (!r.ok && r.fieldErrors) setErrors(r.fieldErrors);
        return r;
      }, { onSuccess: onDone });
    }}>
      <Field id="skill-name" label="Skill" error={errors.name?.[0]}>
        <Input id="skill-name" autoFocus value={v.name} maxLength={120} onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors.name} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="skill-area" label="Area">
          <NativeSelect id="skill-area" value={v.area} onChange={(e) => set("area", e.target.value as SkillInput["area"])}>
            {AREAS.map((a) => <option key={a} value={a}>{a[0].toUpperCase() + a.slice(1)}</option>)}
          </NativeSelect>
        </Field>
        <Field id="skill-level" label="Now">
          <NativeSelect id="skill-level" value={String(v.level ?? "")} onChange={(e) => set("level", e.target.value)}>{levels}</NativeSelect>
        </Field>
        <Field id="skill-target" label="Aiming for">
          <NativeSelect id="skill-target" value={String(v.targetLevel ?? "")} onChange={(e) => set("targetLevel", e.target.value)}>{levels}</NativeSelect>
        </Field>
      </div>
      <Field id="skill-notes" label="Notes" optional>
        <Textarea id="skill-notes" value={v.notes ?? ""} maxLength={5000} onChange={(e) => set("notes", e.target.value)} className="min-h-16" />
      </Field>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
        {skill && <ConfirmDelete title={`Delete “${skill.name}”?`} description="This removes the skill and its rating." onConfirm={() => run(() => deleteSkill(skill.id), { onSuccess: onDone })} disabled={pending} />}
        <div className="flex flex-col-reverse gap-2 sm:ml-auto sm:flex-row">
          <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </form>
  );
}
