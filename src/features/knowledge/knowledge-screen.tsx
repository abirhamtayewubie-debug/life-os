"use client";

import { useEffect, useMemo, useState } from "react";
import Form from "next/form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, FileText, Library, Link2, Paperclip, Pencil, Pin, PinOff, Plus, Search, X } from "lucide-react";
import { ConfirmDelete } from "@/components/data/confirm-delete";
import { EmptyState } from "@/components/data/empty-state";
import { ProvenanceBadge } from "@/components/data/provenance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { localDateKey, formatShortDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { deleteNote, saveNote, setNotePinned, type NoteInput } from "@/server/actions/knowledge";
import { useServerAction } from "@/features/dashboard/use-server-action";
import { NOTE_KIND_LABEL, type KnowledgeWorkspace, type NoteKind, type NoteRecord } from "./types";
import { resolveTitles, segments, titleKey } from "./wikilinks";

type Errors = Record<string, string[] | undefined>;
type Draft = NoteRecord | { title: string } | null;

export function KnowledgeScreen({ ws, openId = null, startNew = false }: { ws: KnowledgeWorkspace; openId?: string | null; startNew?: boolean }) {
  const [selected, setSelected] = useState<string | null>(openId);
  const [editing, setEditing] = useState<Draft>(startNew ? { title: "" } : null);
  const [folder, setFolder] = useState<string>("all");
  const [tag, setTag] = useState<string | null>(null);
  const folders = useMemo(() => [...new Set(ws.notes.map((n) => n.folder).filter((f): f is string => !!f))].sort(), [ws.notes]);
  const shown = ws.notes.filter((n) => (folder === "all" || (folder === "none" ? !n.folder : n.folder === folder)) && (!tag || n.tags.includes(tag)));
  const note = ws.notes.find((n) => n.id === selected) ?? null;
  const router = useRouter();

  useEffect(() => {
    const onNew = () => setEditing({ title: "" });
    window.addEventListener("lifeos:new-note", onNew);
    return () => window.removeEventListener("lifeos:new-note", onNew);
  }, []);

  const openTitle = (title: string) => {
    const { resolved } = resolveTitles([title], ws.index);
    if (resolved[0]) {
      if (ws.notes.some((n) => n.id === resolved[0])) setSelected(resolved[0]);
      else router.push(`/knowledge?note=${resolved[0]}`);
    } else setEditing({ title });
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <div className={cn("grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-3", note && "hidden lg:grid")}>
        <div className="flex gap-2">
          <Form action="/knowledge" className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input name="q" defaultValue={ws.query ?? ""} placeholder="Search notes" aria-label="Search notes" className="pl-8" maxLength={100} />
          </Form>
          <Button size="sm" onClick={() => setEditing({ title: "" })}><Plus /> New</Button>
        </div>
        {ws.query && (
          <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
            {ws.notes.length} {ws.notes.length === 1 ? "note matches" : "notes match"} &ldquo;{ws.query}&rdquo;
            <Link href="/knowledge" className="inline-flex items-center gap-1 text-foreground hover:underline"><X className="size-3" /> Clear</Link>
          </p>
        )}
        {(folders.length > 0 || ws.tags.length > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            {folders.length > 0 && (
              <NativeSelect aria-label="Folder" value={folder} onChange={(e) => setFolder(e.target.value)} className="h-8 w-auto text-[13px]">
                <option value="all">All folders</option>
                {folders.map((f) => <option key={f} value={f}>{f}</option>)}
                <option value="none">No folder</option>
              </NativeSelect>
            )}
            {tag && <Button size="xs" variant="outline" onClick={() => setTag(null)}>#{tag} <X /></Button>}
          </div>
        )}
        {!shown.length ? (
          <Card>
            {ws.query ? (
              <EmptyState compact icon={Search} title="No notes match">Search looks at titles and note text.</EmptyState>
            ) : ws.notes.length ? (
              <EmptyState compact icon={Library} title="Nothing in this filter" />
            ) : (
              <EmptyState icon={Library} title="No notes yet" action={<Button size="sm" onClick={() => setEditing({ title: "" })}><Plus /> Write a note</Button>}>
                Keep ideas, meeting notes, decisions and references here. Link notes by typing [[Note title]].
              </EmptyState>
            )}
          </Card>
        ) : (
          <ul className="grid gap-1" aria-label="Notes">
            {shown.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => setSelected(n.id)} aria-current={selected === n.id || undefined}
                  className={cn("grid w-full cursor-pointer gap-0.5 rounded-lg border border-transparent px-3 py-2 text-left hover:bg-muted", selected === n.id && "border-border bg-surface shadow-card")}>
                  <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium">
                    {n.pinned && <Pin className="size-3 shrink-0 text-muted-foreground" aria-label="Pinned" />}
                    <span className="truncate">{n.title}</span>
                  </span>
                  <span className="flex min-w-0 gap-2 text-[11px] text-muted-foreground">
                    <span>{NOTE_KIND_LABEL[n.kind]}</span>
                    {n.folder && <span className="truncate">{n.folder}</span>}
                    <span className="ml-auto shrink-0">{formatShortDate(localDateKey(new Date(n.updated_at), ws.timezone), ws.locale)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="flex gap-2 text-[11px] leading-relaxed text-muted-foreground">
          <Paperclip className="mt-0.5 size-3 shrink-0" />
          File attachments need file storage, which isn&apos;t switched on yet. For now, add a link to where the file lives.
        </p>
      </div>

      <div className={cn("min-w-0", !note && "hidden lg:block")}>
        {note ? (
          <NoteDetail key={note.id} note={note} ws={ws} onBack={() => setSelected(null)} onEdit={() => setEditing(note)} onOpenTitle={openTitle} onSelect={setSelected} onTag={setTag} onDeleted={() => setSelected(null)} />
        ) : (
          <Card><EmptyState icon={FileText} title="Select a note">Pick a note from the list to read it, see what links to it, or edit it.</EmptyState></Card>
        )}
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing && "id" in editing ? "Edit note" : "New note"}</DialogTitle>
            <DialogDescription>Link to another note by typing its title in double brackets, like [[Project ideas]].</DialogDescription>
          </DialogHeader>
          {editing !== null && (
            <NoteForm draft={editing} ws={ws} onDone={(id) => { setEditing(null); if (id) setSelected(id); }} onCancel={() => setEditing(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NoteDetail({ note, ws, onBack, onEdit, onOpenTitle, onSelect, onTag, onDeleted }: {
  note: NoteRecord; ws: KnowledgeWorkspace; onBack: () => void; onEdit: () => void; onOpenTitle: (t: string) => void; onSelect: (id: string) => void; onTag: (t: string) => void; onDeleted: () => void;
}) {
  const { pending, run } = useServerAction();
  const router = useRouter();
  const titleOf = new Map(ws.index.map((n) => [n.id, n.title]));
  const known = new Set(ws.index.map((n) => titleKey(n.title)));
  const backlinks = ws.links.filter((l) => l.to_id === note.id).map((l) => l.from_id).filter((id) => titleOf.has(id));
  const goal = ws.goals.find((g) => g.id === note.goal_id);
  const project = ws.projects.find((p) => p.id === note.project_id);
  const open = (id: string) => (ws.notes.some((n) => n.id === id) ? onSelect(id) : router.push(`/knowledge?note=${id}`));

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="-ml-2 lg:hidden" onClick={onBack}><ArrowLeft /> Notes</Button>
        <Badge variant="outline">{NOTE_KIND_LABEL[note.kind]}</Badge>
        {note.folder && <span className="text-[12px] text-muted-foreground">{note.folder}</span>}
        <ProvenanceBadge source={note.source} />
        <div className="ml-auto flex gap-1">
          <Button variant="ghost" size="icon-sm" disabled={pending} aria-label={note.pinned ? "Unpin" : "Pin"} onClick={() => run(() => setNotePinned(note.id, !note.pinned))}>{note.pinned ? <PinOff /> : <Pin />}</Button>
          <Button variant="ghost" size="icon-sm" aria-label="Edit note" onClick={onEdit}><Pencil /></Button>
          <ConfirmDelete size="icon-sm" title={`Delete “${note.title}”?`} description="The note, its tags and its links are removed permanently. Notes that mention it keep their text." confirmLabel="Delete note" disabled={pending} onConfirm={() => run(() => deleteNote(note.id), { onSuccess: onDeleted })} label="Delete note" />
        </div>
      </div>
      <h2 className="mt-3 text-lg font-semibold tracking-tight">{note.title}</h2>
      <p className="mt-0.5 text-[12px] text-muted-foreground">Updated {formatShortDate(localDateKey(new Date(note.updated_at), ws.timezone), ws.locale)}</p>
      {note.url && (
        <a href={note.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex max-w-full items-center gap-1 text-[13px] text-brand hover:underline">
          <ExternalLink className="size-3.5 shrink-0" /> <span className="truncate">{note.url}</span>
        </a>
      )}
      <div className="mt-4 text-[14px] leading-relaxed break-words whitespace-pre-wrap">
        {note.body ? segments(note.body).map((s, i) =>
          "text" in s ? <span key={i}>{s.text}</span> : (
            <button key={i} type="button" onClick={() => onOpenTitle(s.link)} className={cn("cursor-pointer underline underline-offset-2", known.has(titleKey(s.link)) ? "text-brand" : "text-muted-foreground decoration-dashed")} title={known.has(titleKey(s.link)) ? "Open note" : "No note with this title yet. Click to create it."}>
              {s.link}
            </button>
          ),
        ) : <span className="text-muted-foreground">This note is empty.</span>}
      </div>
      {(note.tags.length > 0 || goal || project) && (
        <div className="mt-4 flex flex-wrap gap-2 text-[12px]">
          {note.tags.map((t) => <button key={t} type="button" onClick={() => onTag(t)} className="cursor-pointer rounded-md bg-muted px-2 py-0.5 text-muted-foreground hover:text-foreground">#{t}</button>)}
          {goal && <Link href="/goals" className="rounded-md border border-border px-2 py-0.5 hover:bg-muted">Goal: {goal.title}</Link>}
          {project && <Link href={`/work?project=${project.id}`} className="rounded-md border border-border px-2 py-0.5 hover:bg-muted">Project: {project.name}</Link>}
        </div>
      )}
      <Separator className="my-4" />
      <section aria-labelledby="backlinks">
        <h3 id="backlinks" className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground"><Link2 className="size-3.5" /> Linked from</h3>
        {backlinks.length ? (
          <ul className="mt-2 grid gap-1">
            {backlinks.map((id) => <li key={id}><button type="button" className="cursor-pointer text-[13px] hover:underline" onClick={() => open(id)}>{titleOf.get(id)}</button></li>)}
          </ul>
        ) : <p className="mt-1 text-[12px] text-muted-foreground">No other note links here yet. Mention [[{note.title}]] in a note to connect it.</p>}
      </section>
    </Card>
  );
}

function NoteForm({ draft, ws, onDone, onCancel }: { draft: NonNullable<Draft>; ws: KnowledgeWorkspace; onDone: (id?: string) => void; onCancel: () => void }) {
  const existing = "id" in draft ? draft : null;
  const [v, setV] = useState<NoteInput>(() => ({
    title: draft.title, body: existing?.body ?? "", kind: existing?.kind ?? "note", folder: existing?.folder ?? "", url: existing?.url ?? "",
    pinned: existing?.pinned ?? false, goalId: existing?.goal_id ?? "", projectId: existing?.project_id ?? "", tags: existing?.tags.join(", ") ?? "",
  }));
  const [errors, setErrors] = useState<Errors>({});
  const { pending, run } = useServerAction();
  const set = <K extends keyof NoteInput>(k: K, val: NoteInput[K]) => setV((s) => ({ ...s, [k]: val }));
  const err = (k: string) => errors[k]?.[0];
  const folders = [...new Set(ws.notes.map((n) => n.folder).filter(Boolean))] as string[];

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        run(async () => {
          const r = await saveNote(existing?.id ?? null, v);
          if (!r.ok && r.fieldErrors) setErrors(r.fieldErrors);
          return r;
        }, { onSuccess: (r) => onDone(r.data?.id) });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
        <Field id="note-title" label="Title" error={err("title")}>
          <Input id="note-title" autoFocus={!draft.title} value={v.title} maxLength={300} onChange={(e) => set("title", e.target.value)} aria-invalid={!!err("title")} />
        </Field>
        <Field id="note-kind" label="Type">
          <NativeSelect id="note-kind" value={v.kind} onChange={(e) => set("kind", e.target.value as NoteKind)}>
            {Object.entries(NOTE_KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <Field id="note-body" label="Note" optional>
        <Textarea id="note-body" autoFocus={!!draft.title} value={v.body} maxLength={100000} onChange={(e) => set("body", e.target.value)} className="min-h-48 font-[inherit]" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="note-folder" label="Folder" optional>
          <Input id="note-folder" list="note-folders" value={v.folder ?? ""} maxLength={120} onChange={(e) => set("folder", e.target.value)} />
          <datalist id="note-folders">{folders.map((f) => <option key={f} value={f} />)}</datalist>
        </Field>
        <Field id="note-tags" label="Tags" optional hint="Separate with commas.">
          <Input id="note-tags" value={v.tags} maxLength={1000} placeholder="design, client" onChange={(e) => set("tags", e.target.value)} />
        </Field>
      </div>
      <Field id="note-url" label="Link" optional error={err("url")}>
        <Input id="note-url" type="url" inputMode="url" value={v.url ?? ""} placeholder="https://" onChange={(e) => set("url", e.target.value)} aria-invalid={!!err("url")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="note-goal" label="Goal" optional>
          <NativeSelect id="note-goal" value={v.goalId ?? ""} onChange={(e) => set("goalId", e.target.value)}>
            <option value="">None</option>
            {ws.goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </NativeSelect>
        </Field>
        <Field id="note-project" label="Project" optional>
          <NativeSelect id="note-project" value={v.projectId ?? ""} onChange={(e) => set("projectId", e.target.value)}>
            <option value="">None</option>
            {ws.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={!!v.pinned} onChange={(e) => set("pinned", e.target.checked)} className="size-4 accent-[var(--color-brand)]" /> Pin to the top
      </label>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : existing ? "Save changes" : "Add note"}</Button>
      </div>
    </form>
  );
}
