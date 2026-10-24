"use client";

import { useEffect, useMemo, useState } from "react";
import Form from "next/form";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookHeart, Lock, Pencil, Plus, Search, Sparkles, Timer, X } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import { cn } from "@/lib/utils";
import { deleteJournalEntry, deleteValue, saveJournalEntry, saveValue, setJournalSharing, type JournalInput } from "@/server/actions/reflection";
import { useServerAction } from "@/features/dashboard/use-server-action";
import { MeditationForm, MeditationTab, PracticeForm } from "./meditation-tab";
import { suggestedPeriod } from "./reviews";
import { PeriodReviewForm, ReviewsTab, type ReviewTarget } from "./reviews-tab";
import { daysWritten, writingStreak } from "./streak";
import { KIND_LABEL, KIND_PROMPT, type JournalEntry, type JournalKind, type MeditationLink, type PersonalValue, type ReflectionWorkspace } from "./types";

const MOODS = [
  { v: 1, label: "Very low" }, { v: 2, label: "Low" }, { v: 3, label: "Okay" }, { v: 4, label: "Good" }, { v: 5, label: "Very good" },
];
type Errors = Record<string, string[] | undefined>;

export type ReflectionTab = "journal" | "meditation" | "reviews";
const TABS: { v: ReflectionTab; label: string }[] = [
  { v: "journal", label: "Journal" },
  { v: "meditation", label: "Meditation" },
  { v: "reviews", label: "Reviews" },
];

export function ReflectionScreen({ ws, tab = "journal", startNew = false }: { ws: ReflectionWorkspace; tab?: ReflectionTab; startNew?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [meditation, setMeditation] = useState<MeditationLink | "new" | null>(startNew && tab === "meditation" ? "new" : null);
  const [practice, setPractice] = useState<MeditationLink | "any" | null>(null);
  const [review, setReview] = useState<ReviewTarget | null>(startNew && tab === "reviews" ? { kind: "weekly", period: suggestedPeriod("weekly", ws.reviews, ws.today, ws.weekStart) } : null);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Reflection views" className="flex w-max rounded-md bg-muted p-0.5">
          {TABS.map((t) => (
            <button key={t.v} role="tab" aria-selected={tab === t.v} onClick={() => router.replace(t.v === "journal" ? pathname : `${pathname}?tab=${t.v}`, { scroll: false })}
              className={cn("h-7 cursor-pointer rounded px-3 text-[13px] whitespace-nowrap text-muted-foreground", tab === t.v && "bg-surface font-medium text-foreground shadow-card")}>
              {t.label}
            </button>
          ))}
        </div>
        {tab === "meditation" && (
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setPractice("any")}><Timer /> Log practice</Button>
            <Button size="sm" onClick={() => setMeditation("new")}><Plus /> Meditation</Button>
          </div>
        )}
      </div>

      {tab === "meditation" ? <MeditationTab ws={ws} onEdit={(m) => setMeditation(m ?? "new")} onLog={(m) => setPractice(m ?? "any")} />
        : tab === "reviews" ? <ReviewsTab ws={ws} onWrite={setReview} />
        : <JournalTab ws={ws} startNew={startNew} />}

      <Dialog open={meditation !== null} onOpenChange={(o) => !o && setMeditation(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{meditation === "new" ? "Add a meditation" : "Edit meditation"}</DialogTitle>
            <DialogDescription>Paste a YouTube link to a guided meditation you like.</DialogDescription>
          </DialogHeader>
          {meditation !== null && <MeditationForm meditation={meditation === "new" ? null : meditation} onDone={() => setMeditation(null)} onCancel={() => setMeditation(null)} />}
        </DialogContent>
      </Dialog>
      <Dialog open={practice !== null} onOpenChange={(o) => !o && setPractice(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log practice</DialogTitle>
            <DialogDescription>Time you spent meditating.</DialogDescription>
          </DialogHeader>
          {practice !== null && <PracticeForm ws={ws} meditation={practice === "any" ? null : practice} onDone={() => setPractice(null)} onCancel={() => setPractice(null)} />}
        </DialogContent>
      </Dialog>
      <Dialog open={review !== null} onOpenChange={(o) => !o && setReview(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{review?.kind === "monthly" ? "Monthly review" : "Weekly review"}</DialogTitle>
            <DialogDescription>Private to you. Write as much or as little as helps.</DialogDescription>
          </DialogHeader>
          {review !== null && <PeriodReviewForm key={`${review.kind}-${review.period.start}`} ws={ws} target={review} onDone={() => setReview(null)} onCancel={() => setReview(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function JournalTab({ ws, startNew }: { ws: ReflectionWorkspace; startNew: boolean }) {
  const [editing, setEditing] = useState<JournalEntry | "new" | null>(startNew ? "new" : null);
  const [kind, setKind] = useState<JournalKind | "all">("all");
  const [open, setOpen] = useState<string | null>(null);
  const dates = useMemo(() => ws.entries.map((e) => e.entry_date), [ws.entries]);
  const shown = ws.entries.filter((e) => kind === "all" || e.kind === kind);
  const kinds = [...new Set(ws.entries.map((e) => e.kind))];

  useEffect(() => {
    const onNew = () => setEditing("new");
    window.addEventListener("lifeos:new-journal", onNew);
    return () => window.removeEventListener("lifeos:new-journal", onNew);
  }, []);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Form action="/reflection" className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input name="q" defaultValue={ws.query ?? ""} placeholder="Search your journal" aria-label="Search your journal" className="pl-8" maxLength={100} />
          </Form>
          <Button size="sm" className="ml-auto" onClick={() => setEditing("new")}><Plus /> New entry</Button>
        </div>

        {ws.query && (
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            {ws.entries.length} {ws.entries.length === 1 ? "entry matches" : "entries match"} &ldquo;{ws.query}&rdquo;
            <Link href="/reflection" className="inline-flex items-center gap-1 text-foreground hover:underline"><X className="size-3" /> Clear</Link>
          </p>
        )}

        {kinds.length > 1 && (
          <div role="tablist" aria-label="Entry type" className="flex w-fit max-w-full flex-wrap rounded-md bg-muted p-0.5">
            {(["all", ...kinds] as const).map((k) => (
              <button key={k} role="tab" aria-selected={kind === k} onClick={() => setKind(k)} className={cn("h-7 cursor-pointer rounded px-3 text-[13px] text-muted-foreground", kind === k && "bg-surface font-medium text-foreground shadow-card")}>
                {k === "all" ? "All" : KIND_LABEL[k]}
              </button>
            ))}
          </div>
        )}

        {!shown.length ? (
          <Card>
            {ws.query ? (
              <EmptyState icon={Search} title="Nothing matches that search">Try a different word. Search looks at titles and the text of each entry.</EmptyState>
            ) : (
              <EmptyState icon={BookHeart} title="Your journal is empty" action={<Button size="sm" onClick={() => setEditing("new")}><Plus /> Write the first entry</Button>}>
                A few lines a day is plenty. Entries are private to you.
              </EmptyState>
            )}
          </Card>
        ) : (
          <ul className="grid gap-2">
            {shown.map((e) => (
              <li key={e.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
                    <time dateTime={e.entry_date} className="font-medium text-foreground">{formatShortDate(e.entry_date, ws.locale)}</time>
                    <Badge variant="outline">{KIND_LABEL[e.kind]}</Badge>
                    {e.mood && <span>Mood: {MOODS[e.mood - 1].label}</span>}
                    <ProvenanceBadge source={e.source} />
                    {e.ai_access_allowed ? <Badge variant="brand"><Sparkles className="size-3" aria-hidden /> Shared with assistant</Badge> : <span className="flex items-center gap-1"><Lock className="size-3" aria-hidden /> Private</span>}
                    <div className="ml-auto flex gap-1">
                      <ShareEntry id={e.id} shared={e.ai_access_allowed} />
                      <Button variant="ghost" size="icon-sm" aria-label="Edit entry" onClick={() => setEditing(e)}><Pencil /></Button>
                      <DeleteEntry id={e.id} />
                    </div>
                  </div>
                  {e.title && <h3 className="mt-2 text-[14px] font-medium">{e.title}</h3>}
                  <p className={cn("mt-1 text-[13px] leading-relaxed whitespace-pre-wrap text-foreground/90", open !== e.id && "line-clamp-4")}>{e.body}</p>
                  {e.body.length > 280 && (
                    <button type="button" className="mt-1 cursor-pointer text-[12px] text-muted-foreground hover:text-foreground" onClick={() => setOpen(open === e.id ? null : e.id)}>
                      {open === e.id ? "Show less" : "Read all"}
                    </button>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      <aside className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4">
        <Card>
          <CardHeader><CardTitle>Writing rhythm</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Stat label="Day streak" value={ws.query ? "—" : writingStreak(dates, ws.today)} />
            <Stat label="Days in last 30" value={ws.query ? "—" : daysWritten(dates, ws.today)} />
            {ws.query && <p className="col-span-2 text-[11px] text-muted-foreground">Clear the search to see your rhythm.</p>}
          </CardContent>
        </Card>
        <ValuesCard values={ws.values} />
        <p className="flex gap-2 rounded-2xl border border-border bg-muted/40 p-3 text-[12px] leading-relaxed text-muted-foreground">
          <Lock className="mt-0.5 size-3.5 shrink-0" />
          Journal entries are private to your account and never sent to an AI model. The assistant can read an entry only if you share that entry here and switch on Journal in Settings.
        </p>
      </aside>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "New entry" : "Edit entry"}</DialogTitle>
            <DialogDescription>Private to you.</DialogDescription>
          </DialogHeader>
          {editing !== null && <EntryForm entry={editing === "new" ? null : editing} today={ws.today} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <p className="tabular font-display text-xl font-semibold tracking-[-0.025em]">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function DeleteEntry({ id }: { id: string }) {
  const { pending, run } = useServerAction();
  return (
    <ConfirmDelete
      title="Delete this entry?"
      description="It will be removed permanently. This can't be undone."
      confirmLabel="Delete entry"
      disabled={pending}
      onConfirm={() => run(() => deleteJournalEntry(id))}
      size="icon-sm"
      label="Delete entry"
    />
  );
}

function EntryForm({ entry, today, onDone }: { entry: JournalEntry | null; today: string; onDone: () => void }) {
  const [v, setV] = useState<JournalInput>(() => ({
    date: entry?.entry_date ?? today, kind: entry?.kind ?? "journal", title: entry?.title ?? "", body: entry?.body ?? "", mood: entry?.mood ?? "",
  }));
  const [errors, setErrors] = useState<Errors>({});
  const { pending, run } = useServerAction();
  const set = <K extends keyof JournalInput>(k: K, val: JournalInput[K]) => setV((s) => ({ ...s, [k]: val }));
  const err = (k: string) => errors[k]?.[0];
  const k = (v.kind ?? "journal") as JournalKind;

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        run(async () => {
          const r = await saveJournalEntry(entry?.id ?? null, v);
          if (!r.ok && r.fieldErrors) setErrors(r.fieldErrors);
          return r;
        }, { onSuccess: onDone });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="entry-date" label="Date" error={err("date")}>
          <Input id="entry-date" type="date" max={today} value={v.date} onChange={(e) => set("date", e.target.value)} aria-invalid={!!err("date")} />
        </Field>
        <Field id="entry-kind" label="Type">
          <NativeSelect id="entry-kind" value={k} onChange={(e) => set("kind", e.target.value as JournalKind)}>
            {Object.entries(KIND_LABEL).map(([key, l]) => <option key={key} value={key}>{l}</option>)}
          </NativeSelect>
        </Field>
        <Field id="entry-mood" label="Mood" optional>
          <NativeSelect id="entry-mood" value={String(v.mood ?? "")} onChange={(e) => set("mood", e.target.value)}>
            <option value="">Not noted</option>
            {MOODS.map((m) => <option key={m.v} value={m.v}>{m.v} · {m.label}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <Field id="entry-title" label="Title" optional>
        <Input id="entry-title" value={v.title ?? ""} maxLength={200} onChange={(e) => set("title", e.target.value)} />
      </Field>
      <Field id="entry-body" label="Entry" error={err("body")}>
        <Textarea id="entry-body" autoFocus value={v.body} maxLength={50000} placeholder={KIND_PROMPT[k]} onChange={(e) => set("body", e.target.value)} className="min-h-48" aria-invalid={!!err("body")} />
      </Field>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save entry"}</Button>
      </div>
    </form>
  );
}

function ValuesCard({ values }: { values: PersonalValue[] }) {
  const [editing, setEditing] = useState<PersonalValue | "new" | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const { pending, run } = useServerAction();
  const startEdit = (val: PersonalValue | "new") => {
    setEditing(val);
    setName(val === "new" ? "" : val.name);
    setDescription(val === "new" ? "" : val.description ?? "");
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div>
          <CardTitle>Values</CardTitle>
          <CardDescription>What matters most to you, in your words.</CardDescription>
        </div>
        <Button size="icon-sm" variant="ghost" aria-label="Add a value" onClick={() => startEdit("new")}><Plus /></Button>
      </CardHeader>
      <CardContent>
        {!values.length && editing === null && <p className="text-[12px] text-muted-foreground">No values written down yet.</p>}
        <ul className="grid gap-2">
          {values.map((val) => (
            <li key={val.id} className="group flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">{val.name}</p>
                {val.description && <p className="text-[12px] text-muted-foreground">{val.description}</p>}
              </div>
              <Button variant="ghost" size="icon-sm" className="size-6" aria-label={`Edit ${val.name}`} onClick={() => startEdit(val)}><Pencil /></Button>
              <ConfirmDelete size="icon-sm" title={`Remove “${val.name}”?`} description="This only removes it from your list." confirmLabel="Remove" disabled={pending} onConfirm={() => run(() => deleteValue(val.id))} label={`Remove ${val.name}`} />
            </li>
          ))}
        </ul>
        {editing !== null && (
          <form
            className="mt-3 grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => saveValue(editing === "new" ? null : editing.id, { name, description }), { onSuccess: () => setEditing(null) });
            }}
          >
            <Input autoFocus value={name} maxLength={60} placeholder="e.g. Faith, Family, Craft" aria-label="Value" onChange={(e) => setName(e.target.value)} />
            <Textarea value={description} maxLength={1000} placeholder="What it means to you (optional)" aria-label="What it means to you" className="min-h-14" onChange={(e) => setDescription(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={pending || !name.trim()}>Save</Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function ShareEntry({ id, shared }: { id: string; shared: boolean }) {
  const { run, pending } = useServerAction();
  if (shared) return <Button variant="ghost" size="xs" disabled={pending} onClick={() => run(() => setJournalSharing(id, false))}>Make private</Button>;
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild><Button variant="ghost" size="xs" disabled={pending}>Share with assistant</Button></AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>Let the assistant read this entry?</AlertDialogTitle>
        <AlertDialogDescription>
          If Journal is switched on in Settings, this entry&apos;s text can be sent to Anthropic when you ask the assistant something it&apos;s relevant to. Your other entries stay private. You can make it private again at any time.
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep private</AlertDialogCancel>
          <AlertDialogAction onClick={() => run(() => setJournalSharing(id, true))}>Share this entry</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
