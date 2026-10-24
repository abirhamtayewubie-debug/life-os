"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, ExternalLink, Flower2, MoreHorizontal, Pencil, Play, Star, Timer } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { ConfirmDelete } from "@/components/data/confirm-delete";
import { EmptyState } from "@/components/data/empty-state";
import { FormActions, useActionForm } from "@/components/data/action-form";
import { ProvenanceBadge } from "@/components/data/provenance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { addDays, formatShortDate, relativeDay } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { deleteMeditation, deleteMeditationSession, logMeditation, saveMeditation, setMeditationArchived, setMeditationFavourite } from "@/server/actions/reflection";
import { useServerAction } from "@/features/dashboard/use-server-action";
import { mondayOf } from "@/features/learning/plan";
import { embedUrl, practiceByWeek, practiceMinutes, practiceStreak, thumbnailUrl, youtubeId } from "./meditation";
import type { MeditationLink, ReflectionWorkspace } from "./types";

const tooltipStyle = { background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 };

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="grid content-start gap-0.5 p-4">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className="tabular font-display text-xl font-semibold tracking-[-0.025em]">{value}</span>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </Card>
  );
}

/** Saved guided meditations (YouTube plays right here), and the practice log. */
export function MeditationTab({ ws, onEdit, onLog }: { ws: ReflectionWorkspace; onEdit: (m: MeditationLink | null) => void; onLog: (m: MeditationLink | null) => void }) {
  const { run, pending } = useServerAction();
  const [playing, setPlaying] = useState<MeditationLink | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const week = practiceMinutes(ws.practice, mondayOf(ws.today), ws.today);
  const streak = practiceStreak(ws.practice, ws.today);
  const last30 = ws.practice.filter((p) => p.practiced_on > addDays(ws.today, -30));
  const weeks = practiceByWeek(ws.practice, ws.today, 8);
  const active = ws.meditations.filter((m) => !m.archived_at);
  const archived = ws.meditations.filter((m) => m.archived_at);
  const list = showArchived ? archived : active;
  const linkOf = (id: string | null) => (id ? ws.meditations.find((m) => m.id === id) : undefined);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="This week" value={`${week} min`} />
        <Stat label="Practice streak" value={`${streak} ${streak === 1 ? "day" : "days"}`} hint={streak ? "Days in a row" : "Practise today to start one"} />
        <Stat label="Last 30 days" value={`${last30.length} ${last30.length === 1 ? "session" : "sessions"}`} hint={`${last30.reduce((a, p) => a + p.minutes, 0)} min`} />
        <Card className="grid gap-1 p-4">
          <span className="text-[12px] text-muted-foreground">Minutes per week</span>
          <div className="h-12" role="img" aria-label={`Meditation minutes per week: ${weeks.map((w) => `${formatShortDate(w.start, ws.locale)} ${w.minutes}`).join(", ")}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeks.map((w) => ({ ...w, label: formatShortDate(w.start, ws.locale) }))} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                <XAxis dataKey="label" hide />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--color-muted)" }} />
                <Bar dataKey="minutes" name="Minutes" fill="var(--color-chart-2)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <section aria-labelledby="med-library" className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <div className="flex items-center gap-2">
          <h2 id="med-library" className="text-[13px] font-medium">Your meditations</h2>
          {archived.length > 0 && (
            <button type="button" className="ml-auto cursor-pointer text-[12px] text-muted-foreground hover:text-foreground" onClick={() => setShowArchived(!showArchived)}>
              {showArchived ? "Back to your meditations" : `Show ${archived.length} archived`}
            </button>
          )}
        </div>
        {!ws.meditations.length ? (
          <Card>
            <EmptyState icon={Flower2} title="No meditations saved yet" action={<Button size="sm" onClick={() => onEdit(null)}>Add a YouTube link</Button>}>
              Save the guided meditations you like. YouTube videos play right here, and you can log each practice when you finish.
            </EmptyState>
          </Card>
        ) : (
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((m) => {
              const vid = youtubeId(m.url);
              return (
                <li key={m.id}>
                  <Card className="grid h-full grid-rows-[auto_1fr] overflow-hidden">
                    {vid ? (
                      <button type="button" onClick={() => setPlaying(m)} className="group relative aspect-video cursor-pointer overflow-hidden bg-muted" aria-label={`Play ${m.title}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- YouTube thumbnails aren't routed through next/image */}
                        <img src={thumbnailUrl(vid)} alt="" loading="lazy" onError={(e) => { e.currentTarget.hidden = true; }} className="size-full object-cover transition-transform group-hover:scale-[1.02]" />
                        <span className="absolute inset-0 grid place-items-center bg-black/10 group-hover:bg-black/20">
                          <span className="grid size-11 place-items-center rounded-full bg-black/60 text-white"><Play className="size-5 translate-x-px" aria-hidden /></span>
                        </span>
                      </button>
                    ) : (
                      <a href={m.url} target="_blank" rel="noopener noreferrer" className="grid aspect-video place-items-center bg-muted text-[12px] text-muted-foreground hover:text-foreground">
                        <span className="flex items-center gap-1.5"><ExternalLink className="size-4" aria-hidden /> Open link</span>
                      </a>
                    )}
                    <div className="grid content-start gap-2 p-3.5">
                      <div className="flex items-start gap-1">
                        <p className="min-w-0 flex-1 text-[14px] leading-snug font-medium">{m.title}</p>
                        <Button variant="ghost" size="icon-sm" aria-label={m.favourite ? `Unfavourite ${m.title}` : `Favourite ${m.title}`} aria-pressed={m.favourite} disabled={pending} onClick={() => run(() => setMeditationFavourite(m.id, !m.favourite))}>
                          <Star className={cn(m.favourite && "fill-amber-400 text-amber-500")} />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label={`Options for ${m.title}`}><MoreHorizontal /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => onEdit(m)}><Pencil /> Edit</DropdownMenuItem>
                            <DropdownMenuItem asChild><a href={m.url} target="_blank" rel="noopener noreferrer"><ExternalLink /> Open on YouTube</a></DropdownMenuItem>
                            <DropdownMenuItem disabled={pending} onSelect={() => run(() => setMeditationArchived(m.id, !m.archived_at))}>
                              {m.archived_at ? <><ArchiveRestore /> Restore</> : <><Archive /> Archive</>}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <ConfirmDelete size="icon-sm" label={`Delete ${m.title}`} disabled={pending} title="Delete this meditation?" description="The link is removed. Practice you logged with it is kept." onConfirm={() => run(() => deleteMeditation(m.id))} />
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
                        {m.minutes && <span>{m.minutes} min</span>}
                        {m.category && <Badge variant="outline">{m.category}</Badge>}
                        <ProvenanceBadge source={m.source} />
                      </div>
                      {m.notes && <p className="line-clamp-2 text-[12px] text-muted-foreground">{m.notes}</p>}
                      {!m.archived_at && <Button size="sm" variant="outline" className="mt-auto w-fit" onClick={() => onLog(m)}><Timer /> Log practice</Button>}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Card className="grid grid-cols-[minmax(0,1fr)] gap-2 p-5">
        <h2 className="text-[13px] font-medium">Practice log</h2>
        {!ws.practice.length ? (
          <p className="text-[13px] text-muted-foreground">Nothing logged yet. Use “Log practice” after you meditate, with or without a saved video.</p>
        ) : (
          <ul className="divide-y divide-border">
            {ws.practice.slice(0, 40).map((p) => (
              <li key={p.id} className="flex items-start gap-3 py-2 text-[13px]">
                <span className="w-20 shrink-0 text-[12px] text-muted-foreground">{relativeDay(p.practiced_on, ws.today)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate">{linkOf(p.link_id)?.title ?? "Meditation"}</p>
                  {p.notes && <p className="line-clamp-2 text-[12px] text-muted-foreground">{p.notes}</p>}
                </div>
                <ProvenanceBadge source={p.source} />
                <span className="tabular shrink-0 text-muted-foreground">{p.minutes} min</span>
                <ConfirmDelete size="icon-sm" title="Delete this practice?" description="It comes off your totals and streak." confirmLabel="Delete" disabled={pending} onConfirm={() => run(() => deleteMeditationSession(p.id))} label="Delete practice" />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Dialog open={playing !== null} onOpenChange={(o) => !o && setPlaying(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{playing?.title}</DialogTitle>
            <DialogDescription>{playing?.minutes ? `${playing.minutes} minutes. ` : ""}Find a comfortable seat. Log your practice when you&apos;re done.</DialogDescription>
          </DialogHeader>
          {playing && youtubeId(playing.url) && (
            <div className="aspect-video overflow-hidden rounded-xl bg-black">
              <iframe
                src={embedUrl(youtubeId(playing.url)!)}
                title={playing.title}
                className="size-full"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
              />
            </div>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setPlaying(null)}>Close</Button>
            <Button onClick={() => { const m = playing; setPlaying(null); onLog(m); }}><Timer /> I finished, log it</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function MeditationForm({ meditation, onDone, onCancel }: { meditation: MeditationLink | null; onDone: () => void; onCancel: () => void }) {
  const { v, set, err, pending, submit } = useActionForm(() => ({
    title: meditation?.title ?? "",
    url: meditation?.url ?? "",
    minutes: meditation?.minutes?.toString() ?? "",
    category: meditation?.category ?? "",
    notes: meditation?.notes ?? "",
    favourite: meditation?.favourite ?? false,
  }));
  const isYouTube = !!youtubeId(v.url);
  return (
    <form noValidate className="grid gap-4" onSubmit={submit((x) => saveMeditation(meditation?.id ?? null, x), onDone)}>
      <Field id="med-url" label="Link" error={err("url")}>
        <Input id="med-url" type="url" autoFocus={!meditation} placeholder="https://www.youtube.com/watch?v=…" value={v.url} onChange={(e) => set("url", e.target.value)} aria-invalid={!!err("url")} />
      </Field>
      {v.url && !err("url") && <p className="-mt-2 text-[12px] text-muted-foreground">{isYouTube ? "YouTube link: it will play inside Life OS." : "Not a YouTube link: it will open in a new tab."}</p>}
      <Field id="med-title" label="Name" error={err("title")}>
        <Input id="med-title" value={v.title} maxLength={200} placeholder="Morning breath, body scan for sleep…" onChange={(e) => set("title", e.target.value)} aria-invalid={!!err("title")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="med-min" label="Length in minutes" optional error={err("minutes")}>
          <Input id="med-min" inputMode="numeric" value={v.minutes} onChange={(e) => set("minutes", e.target.value.replace(/\D/g, "").slice(0, 3))} aria-invalid={!!err("minutes")} />
        </Field>
        <Field id="med-cat" label="Kind" optional>
          <Input id="med-cat" list="med-cats" value={v.category} maxLength={60} placeholder="Morning, Sleep, Focus…" onChange={(e) => set("category", e.target.value)} />
          <datalist id="med-cats">{["Morning", "Sleep", "Focus", "Breathing", "Gratitude", "Anxiety", "Body scan"].map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
      </div>
      <Field id="med-notes" label="Notes" optional>
        <Textarea id="med-notes" value={v.notes} maxLength={2000} className="min-h-14" onChange={(e) => set("notes", e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={v.favourite} onChange={(e) => set("favourite", e.target.checked)} className="size-4 accent-[var(--brand)]" />
        Favourite (shown first)
      </label>
      <FormActions pending={pending} label={meditation ? "Save changes" : "Add meditation"} onCancel={onCancel} />
    </form>
  );
}

export function PracticeForm({ ws, meditation, onDone, onCancel }: { ws: ReflectionWorkspace; meditation: MeditationLink | null; onDone: () => void; onCancel: () => void }) {
  const { v, set, err, pending, submit } = useActionForm(() => ({
    date: ws.today, minutes: meditation?.minutes?.toString() ?? "10", linkId: meditation?.id ?? "", notes: "",
  }));
  return (
    <form noValidate className="grid gap-4" onSubmit={submit(logMeditation, onDone)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="pr-date" label="Day" error={err("date")}>
          <Input id="pr-date" type="date" max={ws.today} value={v.date} onChange={(e) => set("date", e.target.value)} aria-invalid={!!err("date")} />
        </Field>
        <Field id="pr-min" label="Minutes" error={err("minutes")}>
          <Input id="pr-min" inputMode="numeric" autoFocus value={v.minutes} onChange={(e) => set("minutes", e.target.value.replace(/\D/g, "").slice(0, 4))} aria-invalid={!!err("minutes")} />
        </Field>
      </div>
      <Field id="pr-link" label="Meditation" optional>
        <NativeSelect id="pr-link" value={v.linkId} onChange={(e) => set("linkId", e.target.value)}>
          <option value="">On my own</option>
          {ws.meditations.filter((m) => !m.archived_at || m.id === v.linkId).map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
        </NativeSelect>
      </Field>
      <Field id="pr-notes" label="How was it?" optional>
        <Textarea id="pr-notes" value={v.notes} maxLength={2000} className="min-h-14" placeholder="What you noticed. For a longer note, write a Meditation entry in your journal." onChange={(e) => set("notes", e.target.value)} />
      </Field>
      <FormActions pending={pending} label="Log practice" onCancel={onCancel} />
    </form>
  );
}
