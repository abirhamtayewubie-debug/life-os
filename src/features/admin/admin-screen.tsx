"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, FileText, Home, Pencil, Plus, RefreshCw, RotateCcw } from "lucide-react";
import { ConfirmDelete } from "@/components/data/confirm-delete";
import { EmptyState } from "@/components/data/empty-state";
import { ProvenanceBadge } from "@/components/data/provenance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { formatShortDate } from "@/lib/dates";
import { describeRule, parseRule } from "@/lib/recurrence";
import { deleteAdminItem, markAdminDone, reopenAdminItem, saveAdminItem, type AdminItemInput } from "@/server/actions/admin";
import { useServerAction } from "@/features/dashboard/use-server-action";
import { dueStatus } from "./status";
import { ADMIN_KIND_HINT, ADMIN_KIND_LABEL, type AdminItem, type AdminKind, type AdminWorkspace } from "./types";

type Errors = Record<string, string[] | undefined>;

export function AdminScreen({ ws, startNew = false }: { ws: AdminWorkspace; startNew?: boolean }) {
  const [editing, setEditing] = useState<AdminItem | AdminKind | null>(startNew ? "renewal" : null);
  const [showDone, setShowDone] = useState(false);
  const withStatus = ws.items.map((i) => ({ i, ...dueStatus(i, ws.today) }));
  const attention = withStatus.filter((x) => x.status === "overdue" || x.status === "soon");
  const later = withStatus.filter((x) => x.status === "later");
  const docs = ws.items.filter((i) => i.kind === "document");
  const records = ws.items.filter((i) => i.kind === "record");
  const done = ws.items.filter((i) => i.completed_at && i.kind !== "document" && i.kind !== "record");

  useEffect(() => {
    const onNew = () => setEditing("renewal");
    window.addEventListener("lifeos:new-admin", onNew);
    return () => window.removeEventListener("lifeos:new-admin", onNew);
  }, []);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13px] text-muted-foreground">{attention.length ? `${attention.length} need${attention.length === 1 ? "s" : ""} attention` : "Nothing due soon"}</p>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing("document")}><FileText /> Document</Button>
            <Button size="sm" onClick={() => setEditing("renewal")}><Plus /> Renewal or job</Button>
          </div>
        </div>
        {!ws.items.length ? (
          <Card>
            <EmptyState icon={Home} title="Nothing tracked yet" action={<Button size="sm" onClick={() => setEditing("renewal")}><Plus /> Add a renewal</Button>}>
              Track what expires (insurance, licences, passports), where important papers are kept, and records of home repairs.
            </EmptyState>
          </Card>
        ) : (
          <>
            {attention.length > 0 && <Section title="Needs attention" items={attention.map((x) => x.i)} ws={ws} onEdit={setEditing} />}
            {later.length > 0 && <Section title="Coming up later" items={later.map((x) => x.i)} ws={ws} onEdit={setEditing} />}
            {docs.length > 0 && <Section title="Documents" items={docs} ws={ws} onEdit={setEditing} />}
            {records.length > 0 && <Section title="Records" items={records} ws={ws} onEdit={setEditing} />}
            {done.length > 0 && (showDone
              ? <Section title="Done" items={done} ws={ws} onEdit={setEditing} />
              : <button type="button" className="w-fit cursor-pointer text-[12px] text-muted-foreground hover:text-foreground" onClick={() => setShowDone(true)}>Show {done.length} done</button>)}
          </>
        )}
      </div>

      <div className="grid h-fit gap-4">
        <Card>
          <CardHeader><div><CardTitle>Household routines</CardTitle><CardDescription>Repeating tasks in the Home area.</CardDescription></div></CardHeader>
          <CardContent>
            {!ws.routines.length ? (
              <p className="text-[12px] text-muted-foreground">No repeating home tasks yet. Create a task in the Home area and set it to repeat, and it will show here.</p>
            ) : (
              <ul className="grid gap-2">
                {ws.routines.map((r) => (
                  <li key={r.id} className="text-[13px]">
                    <Link href={`/tasks?view=all&open=${r.id}`} className="font-medium hover:underline">{r.title}</Link>
                    <p className="text-[12px] text-muted-foreground">{describeRule(parseRule(r.recurrence_rule))}{r.due_date ? ` · next ${formatShortDate(r.due_date, ws.locale)}` : ""}</p>
                  </li>
                ))}
              </ul>
            )}
            <Button asChild size="sm" variant="outline" className="mt-3"><Link href="/tasks?new=1">New task</Link></Button>
          </CardContent>
        </Card>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Due items are highlighted here while the app is open; there are no notifications yet. Costs for renewals and repairs will connect to Finance in phase 4.
        </p>
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{typeof editing === "string" ? "Add to home & admin" : "Edit"}</DialogTitle>
            <DialogDescription>Reference numbers and notes are private to you.</DialogDescription>
          </DialogHeader>
          {editing !== null && <ItemForm item={typeof editing === "string" ? null : editing} initialKind={typeof editing === "string" ? editing : editing.kind} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({ title, items, ws, onEdit }: { title: string; items: AdminItem[]; ws: AdminWorkspace; onEdit: (i: AdminItem) => void }) {
  return (
    <section className="grid gap-2" aria-label={title}>
      <h2 className="text-[12px] font-medium text-muted-foreground">{title} <span className="tabular">{items.length}</span></h2>
      <ul className="grid gap-2">{items.map((i) => <Row key={i.id} item={i} ws={ws} onEdit={() => onEdit(i)} />)}</ul>
    </section>
  );
}

function Row({ item, ws, onEdit }: { item: AdminItem; ws: AdminWorkspace; onEdit: () => void }) {
  const { pending, run } = useServerAction();
  const { status, inDays } = dueStatus(item, ws.today);
  const repeats = item.kind === "renewal" && item.repeat_months;
  return (
    <li>
      <Card className="flex flex-wrap items-start gap-2 p-3.5">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-[14px] font-medium">
            <span className={item.completed_at ? "text-muted-foreground line-through" : undefined}>{item.title}</span>
            {status === "overdue" && <Badge variant="danger">{-inDays!} {inDays === -1 ? "day" : "days"} overdue</Badge>}
            {status === "soon" && <Badge variant="warning">{inDays === 0 ? "Due today" : `Due in ${inDays} ${inDays === 1 ? "day" : "days"}`}</Badge>}
          </p>
          <p className="mt-0.5 flex flex-wrap gap-x-2 text-[12px] text-muted-foreground">
            <span>{ADMIN_KIND_LABEL[item.kind]}</span>
            {item.category && <span>{item.category}</span>}
            {item.due_on && <span>{item.kind === "record" ? "On" : item.kind === "document" ? "Expires" : "Due"} {formatShortDate(item.due_on, ws.locale)}</span>}
            {repeats && <span>every {item.repeat_months === 12 ? "year" : `${item.repeat_months} months`}</span>}
            {item.location && <span>Kept: {item.location}</span>}
            {item.reference && <span>Ref. {item.reference}</span>}
          </p>
          {item.notes && <p className="mt-1 line-clamp-2 text-[12px] whitespace-pre-wrap text-muted-foreground">{item.notes}</p>}
        </div>
        <ProvenanceBadge source={item.source} />
        {(item.kind === "renewal" || item.kind === "chore") && (item.completed_at
          ? <Button size="xs" variant="ghost" disabled={pending} onClick={() => run(() => reopenAdminItem(item.id))}><RotateCcw /> Reopen</Button>
          : <Button size="xs" variant="outline" disabled={pending} onClick={() => run(() => markAdminDone(item.id))}>{repeats ? <><RefreshCw /> Renewed</> : item.kind === "renewal" ? <><CheckCircle2 /> Renewed</> : <><CheckCircle2 /> Done</>}</Button>)}
        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${item.title}`} onClick={onEdit}><Pencil /></Button>
        <ConfirmDelete size="icon-sm" title={`Delete “${item.title}”?`} description="It will be removed permanently." disabled={pending} onConfirm={() => run(() => deleteAdminItem(item.id))} label={`Delete ${item.title}`} />
      </Card>
    </li>
  );
}

function ItemForm({ item, initialKind, onDone }: { item: AdminItem | null; initialKind: AdminKind; onDone: () => void }) {
  const [v, setV] = useState<AdminItemInput>(() => ({
    kind: initialKind, title: item?.title ?? "", category: item?.category ?? "", dueOn: item?.due_on ?? "", repeatMonths: item?.repeat_months ?? "",
    remindDaysBefore: item?.remind_days_before ?? 14, location: item?.location ?? "", reference: item?.reference ?? "", notes: item?.notes ?? "",
  }));
  const [errors, setErrors] = useState<Errors>({});
  const { pending, run } = useServerAction();
  const set = <K extends keyof AdminItemInput>(k: K, val: AdminItemInput[K]) => setV((s) => ({ ...s, [k]: val }));
  const err = (k: string) => errors[k]?.[0];
  const dated = v.kind === "renewal" || v.kind === "chore";
  return (
    <form noValidate className="grid gap-4" onSubmit={(e) => {
      e.preventDefault();
      setErrors({});
      run(async () => {
        const r = await saveAdminItem(item?.id ?? null, v);
        if (!r.ok && r.fieldErrors) setErrors(r.fieldErrors);
        return r;
      }, { onSuccess: onDone });
    }}>
      <Field id="admin-kind" label="Type" hint={ADMIN_KIND_HINT[v.kind]}>
        <NativeSelect id="admin-kind" value={v.kind} onChange={(e) => set("kind", e.target.value as AdminKind)}>
          {Object.entries(ADMIN_KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </NativeSelect>
      </Field>
      <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
        <Field id="admin-title" label="Title" error={err("title")}>
          <Input id="admin-title" autoFocus value={v.title} maxLength={200} onChange={(e) => set("title", e.target.value)} aria-invalid={!!err("title")} />
        </Field>
        <Field id="admin-category" label="Category" optional>
          <Input id="admin-category" value={v.category ?? ""} maxLength={60} placeholder="Vehicle, Home…" onChange={(e) => set("category", e.target.value)} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="admin-due" label={v.kind === "record" ? "Date" : v.kind === "document" ? "Expires" : v.kind === "renewal" ? "Expires / due" : "Due"} optional={!dated} error={err("dueOn")}>
          <Input id="admin-due" type="date" value={v.dueOn ?? ""} onChange={(e) => set("dueOn", e.target.value)} aria-invalid={!!err("dueOn")} />
        </Field>
        {v.kind === "renewal" && (
          <Field id="admin-repeat" label="Renews every" optional error={err("repeatMonths")} hint="Months, e.g. 12.">
            <Input id="admin-repeat" inputMode="numeric" value={String(v.repeatMonths ?? "")} onChange={(e) => set("repeatMonths", e.target.value)} aria-invalid={!!err("repeatMonths")} />
          </Field>
        )}
        {dated && (
          <Field id="admin-remind" label="Flag it days before" error={err("remindDaysBefore")}>
            <Input id="admin-remind" inputMode="numeric" value={String(v.remindDaysBefore ?? "")} onChange={(e) => set("remindDaysBefore", e.target.value)} aria-invalid={!!err("remindDaysBefore")} />
          </Field>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="admin-location" label="Where it's kept" optional>
          <Input id="admin-location" value={v.location ?? ""} maxLength={300} placeholder="Blue folder, home office" onChange={(e) => set("location", e.target.value)} />
        </Field>
        <Field id="admin-ref" label="Reference number" optional>
          <Input id="admin-ref" value={v.reference ?? ""} maxLength={200} autoComplete="off" onChange={(e) => set("reference", e.target.value)} />
        </Field>
      </div>
      <Field id="admin-notes" label="Notes" optional>
        <Textarea id="admin-notes" value={v.notes ?? ""} maxLength={5000} onChange={(e) => set("notes", e.target.value)} className="min-h-16" />
      </Field>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : item ? "Save changes" : "Add"}</Button>
      </div>
    </form>
  );
}
