"use client";

import { useEffect, useState } from "react";
import { CalendarHeart, ListPlus, Lock, Pencil, Plus, Users } from "lucide-react";
import { ConfirmDelete } from "@/components/data/confirm-delete";
import { EmptyState } from "@/components/data/empty-state";
import { ProvenanceBadge } from "@/components/data/provenance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { formatShortDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { createTask } from "@/server/actions/tasks";
import { deleteImportantDate, deleteInteraction, deletePerson, logInteraction, saveImportantDate, savePerson, type ImportantDateInput, type PersonInput } from "@/server/actions/relationships";
import { useServerAction } from "@/features/dashboard/use-server-action";
import { contactState, upcomingDates } from "./dates";
import { DATE_KIND_LABEL, INTERACTION_LABEL, type ImportantDate, type ImportantDateKind, type InteractionKind, type Person, type RelationshipsWorkspace } from "./types";

type Errors = Record<string, string[] | undefined>;

const inDaysLabel = (n: number) => (n === 0 ? "Today" : n === 1 ? "Tomorrow" : `In ${n} days`);

export function RelationshipsScreen({ ws, startNew = false }: { ws: RelationshipsWorkspace; startNew?: boolean }) {
  const [editingPerson, setEditingPerson] = useState<Person | "new" | null>(startNew ? "new" : null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [editingDate, setEditingDate] = useState<ImportantDate | "new" | null>(null);
  const upcoming = upcomingDates(ws.people, ws.dates, ws.today);
  const due = ws.people.map((p) => ({ p, c: contactState(p, ws.today) })).filter(({ c }) => c.status === "due" || c.status === "never").sort((a, b) => b.c.overdueDays - a.c.overdueDays);
  const person = ws.people.find((p) => p.id === viewing) ?? null;

  useEffect(() => {
    const onNew = () => setEditingPerson("new");
    window.addEventListener("lifeos:new-person", onNew);
    return () => window.removeEventListener("lifeos:new-person", onNew);
  }, []);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid min-w-0 content-start gap-4">
        <div className="flex items-center gap-2">
          <p className="text-[13px] text-muted-foreground">{ws.people.length} {ws.people.length === 1 ? "person" : "people"}</p>
          <Button size="sm" className="ml-auto" onClick={() => setEditingPerson("new")}><Plus /> Add person</Button>
        </div>
        {due.length > 0 && (
          <Card>
            <CardHeader><div><CardTitle>Time to reach out</CardTitle><CardDescription>Based on how often you said you&apos;d like to be in touch.</CardDescription></div></CardHeader>
            <CardContent>
              <ul className="grid gap-2">
                {due.map(({ p, c }) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                    <button type="button" className="cursor-pointer font-medium hover:underline" onClick={() => setViewing(p.id)}>{p.name}</button>
                    <span className="text-muted-foreground">
                      {c.status === "never" ? "No contact logged yet" : c.overdueDays === 0 ? "Due today" : `${c.overdueDays} ${c.overdueDays === 1 ? "day" : "days"} past your rhythm`}
                    </span>
                    <ReachOutTask person={p} today={ws.today} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
        {!ws.people.length ? (
          <Card>
            <EmptyState icon={Users} title="No people yet" action={<Button size="sm" onClick={() => setEditingPerson("new")}><Plus /> Add someone</Button>}>
              Add the people you want to stay close to, with birthdays and how often you&apos;d like to be in touch.
            </EmptyState>
          </Card>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {ws.people.map((p) => {
              const c = contactState(p, ws.today);
              return (
                <li key={p.id}>
                  <button type="button" onClick={() => setViewing(p.id)} className="grid w-full cursor-pointer gap-1 rounded-xl border border-border bg-surface p-3.5 text-left shadow-card hover:border-brand/40">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-medium">{p.name}</span>
                      {p.relationship && <Badge variant="outline">{p.relationship}</Badge>}
                      <span className="ml-auto"><ProvenanceBadge source={p.source} /></span>
                    </span>
                    <span className="text-[12px] text-muted-foreground">
                      {p.last_contacted_on ? `Last in touch ${formatShortDate(p.last_contacted_on, ws.locale)}` : "No contact logged"}
                      {c.status === "due" && <span className="text-warning"> · time to reach out</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="flex gap-2 text-[11px] leading-relaxed text-muted-foreground">
          <Lock className="mt-0.5 size-3 shrink-0" /> Notes about people are private to your account and are never shared or sent to an AI model.
        </p>
      </div>

      <Card className="h-fit">
        <CardHeader>
          <div><CardTitle>Coming up</CardTitle><CardDescription>Birthdays and dates in the next 60 days.</CardDescription></div>
          <Button size="icon-sm" variant="ghost" aria-label="Add an important date" onClick={() => setEditingDate("new")}><Plus /></Button>
        </CardHeader>
        <CardContent>
          {!upcoming.length ? (
            <EmptyState compact icon={CalendarHeart} title="Nothing in the next 60 days" action={<Button size="sm" variant="outline" onClick={() => setEditingDate("new")}>Add a date</Button>} />
          ) : (
            <ul className="grid gap-2.5">
              {upcoming.map((u) => {
                const d = u.dateId ? ws.dates.find((x) => x.id === u.dateId) : null;
                return (
                  <li key={u.key} className="flex items-start gap-2 text-[13px]">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{u.title}</p>
                      <p className="text-[12px] text-muted-foreground">
                        {formatShortDate(u.on, ws.locale)} · <span className={cn(u.inDays <= u.remind && "font-medium text-foreground")}>{inDaysLabel(u.inDays)}</span>
                        {u.years !== null && u.years > 0 && <> · {u.kind === "birthday" ? `turns ${u.years}` : `${u.years} years`}</>}
                      </p>
                    </div>
                    {d && <Button variant="ghost" size="icon-sm" className="size-6" aria-label={`Edit ${d.title}`} onClick={() => setEditingDate(d)}><Pencil /></Button>}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">Dates are highlighted here as they get close. This page doesn&apos;t send notifications.</p>
        </CardContent>
      </Card>

      <Dialog open={editingPerson !== null} onOpenChange={(o) => !o && setEditingPerson(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPerson === "new" ? "Add a person" : "Edit person"}</DialogTitle>
            <DialogDescription>Only you can see this.</DialogDescription>
          </DialogHeader>
          {editingPerson !== null && <PersonForm person={editingPerson === "new" ? null : editingPerson} today={ws.today} onDone={(id) => { setEditingPerson(null); if (id) setViewing(id); }} />}
        </DialogContent>
      </Dialog>

      <Dialog open={person !== null} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="sm:max-w-xl">
          {person && <PersonDetail person={person} ws={ws} onEdit={() => { setEditingPerson(person); setViewing(null); }} onClose={() => setViewing(null)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={editingDate !== null} onOpenChange={(o) => !o && setEditingDate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingDate === "new" ? "Add an important date" : "Edit date"}</DialogTitle>
            <DialogDescription>Anniversaries, memorials and other dates worth remembering. Birthdays live on each person.</DialogDescription>
          </DialogHeader>
          {editingDate !== null && <DateForm date={editingDate === "new" ? null : editingDate} people={ws.people} onDone={() => setEditingDate(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReachOutTask({ person, today }: { person: Person; today: string }) {
  const { pending, run } = useServerAction();
  return (
    <Button size="xs" variant="outline" className="ml-auto" disabled={pending} onClick={() => run(() => createTask({ title: `Reach out to ${person.name}`, area: "family", dueDate: today }))}>
      <ListPlus /> Add a task
    </Button>
  );
}

function PersonDetail({ person, ws, onEdit, onClose }: { person: Person; ws: RelationshipsWorkspace; onEdit: () => void; onClose: () => void }) {
  const history = ws.interactions.filter((i) => i.person_id === person.id);
  const dates = ws.dates.filter((d) => d.person_id === person.id);
  const c = contactState(person, ws.today);
  const [kind, setKind] = useState<InteractionKind>("message");
  const [date, setDate] = useState(ws.today);
  const [note, setNote] = useState("");
  const { pending, run } = useServerAction();

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">{person.name} {person.relationship && <Badge variant="outline">{person.relationship}</Badge>}</DialogTitle>
        <DialogDescription>
          {person.birthday ? `Birthday ${formatShortDate(person.birthday, ws.locale)}` : "No birthday saved"}
          {person.contact_every_days ? ` · in touch every ${person.contact_every_days} days` : ""}
          {c.due && c.status === "ok" ? ` · next by ${formatShortDate(c.due, ws.locale)}` : ""}
        </DialogDescription>
      </DialogHeader>
      {person.notes && <p className="rounded-lg bg-muted/50 p-3 text-[13px] whitespace-pre-wrap">{person.notes}</p>}

      <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); run(() => logInteraction({ personId: person.id, date, kind, note }), { onSuccess: () => setNote("") }); }}>
        <p className="text-[12px] font-medium text-muted-foreground">Log time together</p>
        <div className="grid grid-cols-2 gap-2">
          <NativeSelect aria-label="How" value={kind} onChange={(e) => setKind(e.target.value as InteractionKind)}>
            {Object.entries(INTERACTION_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </NativeSelect>
          <Input type="date" aria-label="When" max={ws.today} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Input aria-label="Note" placeholder="A short note (optional)" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
          <Button type="submit" disabled={pending}>Log</Button>
        </div>
      </form>

      <Separator />
      <div className="grid max-h-56 gap-2 overflow-y-auto">
        {!history.length ? <p className="text-[12px] text-muted-foreground">Nothing logged yet.</p> : history.map((i) => (
          <div key={i.id} className="flex items-start gap-2 text-[13px]">
            <span className="w-20 shrink-0 text-[12px] text-muted-foreground">{formatShortDate(i.occurred_on, ws.locale)}</span>
            <span className="min-w-0 flex-1">{INTERACTION_LABEL[i.kind]}{i.note && <span className="text-muted-foreground"> · {i.note}</span>}</span>
            <ConfirmDelete size="icon-sm" title="Delete this entry?" description="It will be removed from the history." disabled={pending} onConfirm={() => run(() => deleteInteraction(i.id))} label="Delete entry" />
          </div>
        ))}
      </div>
      {dates.length > 0 && (
        <p className="text-[12px] text-muted-foreground">Dates: {dates.map((d) => `${d.title} (${formatShortDate(d.date, ws.locale)})`).join(", ")}</p>
      )}
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <ConfirmDelete title={`Remove ${person.name}?`} description="Their notes, history and dates are deleted permanently." confirmLabel="Remove" disabled={pending} onConfirm={() => run(() => deletePerson(person.id), { onSuccess: onClose })} label="Remove" />
        <Button variant="outline" className="sm:ml-auto" onClick={onEdit}><Pencil /> Edit</Button>
      </div>
    </>
  );
}

function PersonForm({ person, today, onDone }: { person: Person | null; today: string; onDone: (id?: string) => void }) {
  const [v, setV] = useState<PersonInput>(() => ({ name: person?.name ?? "", relationship: person?.relationship ?? "", birthday: person?.birthday ?? "", contactEveryDays: person?.contact_every_days ?? "", notes: person?.notes ?? "" }));
  const [errors, setErrors] = useState<Errors>({});
  const { pending, run } = useServerAction();
  const set = <K extends keyof PersonInput>(k: K, val: PersonInput[K]) => setV((s) => ({ ...s, [k]: val }));
  const err = (k: string) => errors[k]?.[0];
  return (
    <form noValidate className="grid gap-4" onSubmit={(e) => {
      e.preventDefault();
      setErrors({});
      run(async () => {
        const r = await savePerson(person?.id ?? null, v);
        if (!r.ok && r.fieldErrors) setErrors(r.fieldErrors);
        return r;
      }, { onSuccess: (r) => onDone(r.data?.id) });
    }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="person-name" label="Name" error={err("name")}>
          <Input id="person-name" autoFocus value={v.name} maxLength={120} onChange={(e) => set("name", e.target.value)} aria-invalid={!!err("name")} />
        </Field>
        <Field id="person-rel" label="Relationship" optional>
          <Input id="person-rel" value={v.relationship ?? ""} maxLength={60} placeholder="Friend, family, mentor…" onChange={(e) => set("relationship", e.target.value)} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="person-birthday" label="Birthday" optional error={err("birthday")}>
          <Input id="person-birthday" type="date" max={today} value={v.birthday ?? ""} onChange={(e) => set("birthday", e.target.value)} aria-invalid={!!err("birthday")} />
        </Field>
        <Field id="person-every" label="Be in touch every" optional error={err("contactEveryDays")} hint="In days, e.g. 7 for weekly.">
          <Input id="person-every" inputMode="numeric" value={String(v.contactEveryDays ?? "")} onChange={(e) => set("contactEveryDays", e.target.value)} aria-invalid={!!err("contactEveryDays")} />
        </Field>
      </div>
      <Field id="person-notes" label="Private notes" optional>
        <Textarea id="person-notes" value={v.notes ?? ""} maxLength={10000} onChange={(e) => set("notes", e.target.value)} className="min-h-20" placeholder="Things to remember: kids' names, what they're going through, gift ideas…" />
      </Field>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={() => onDone()}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : person ? "Save changes" : "Add person"}</Button>
      </div>
    </form>
  );
}

function DateForm({ date, people, onDone }: { date: ImportantDate | null; people: Person[]; onDone: () => void }) {
  const [v, setV] = useState<ImportantDateInput>(() => ({ title: date?.title ?? "", kind: date?.kind ?? "anniversary", date: date?.date ?? "", recursYearly: date?.recurs_yearly ?? true, remindDaysBefore: date?.remind_days_before ?? 3, personId: date?.person_id ?? "" }));
  const [errors, setErrors] = useState<Errors>({});
  const { pending, run } = useServerAction();
  const set = <K extends keyof ImportantDateInput>(k: K, val: ImportantDateInput[K]) => setV((s) => ({ ...s, [k]: val }));
  const err = (k: string) => errors[k]?.[0];
  return (
    <form noValidate className="grid gap-4" onSubmit={(e) => {
      e.preventDefault();
      setErrors({});
      run(async () => {
        const r = await saveImportantDate(date?.id ?? null, v);
        if (!r.ok && r.fieldErrors) setErrors(r.fieldErrors);
        return r;
      }, { onSuccess: onDone });
    }}>
      <Field id="date-title" label="What" error={err("title")}>
        <Input id="date-title" autoFocus value={v.title} maxLength={200} onChange={(e) => set("title", e.target.value)} aria-invalid={!!err("title")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="date-kind" label="Type">
          <NativeSelect id="date-kind" value={v.kind} onChange={(e) => set("kind", e.target.value as ImportantDateKind)}>
            {Object.entries(DATE_KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </NativeSelect>
        </Field>
        <Field id="date-date" label="Date" error={err("date")} hint={v.recursYearly ? "The original date. It repeats every year." : undefined}>
          <Input id="date-date" type="date" value={v.date} onChange={(e) => set("date", e.target.value)} aria-invalid={!!err("date")} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="date-person" label="Person" optional>
          <NativeSelect id="date-person" value={v.personId ?? ""} onChange={(e) => set("personId", e.target.value)}>
            <option value="">None</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </NativeSelect>
        </Field>
        <Field id="date-remind" label="Show it this many days before" error={err("remindDaysBefore")}>
          <Input id="date-remind" inputMode="numeric" value={String(v.remindDaysBefore ?? "")} onChange={(e) => set("remindDaysBefore", e.target.value)} aria-invalid={!!err("remindDaysBefore")} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={!!v.recursYearly} onChange={(e) => set("recursYearly", e.target.checked)} className="size-4 accent-[var(--color-brand)]" /> Repeats every year
      </label>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
        {date && <ConfirmDelete title={`Delete “${date.title}”?`} description="The date will be removed." onConfirm={() => run(() => deleteImportantDate(date.id), { onSuccess: onDone })} disabled={pending} />}
        <div className="flex flex-col-reverse gap-2 sm:ml-auto sm:flex-row">
          <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </form>
  );
}
