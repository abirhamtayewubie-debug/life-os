"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CartesianGrid, Line, LineChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Orbit, Pencil, Plus } from "lucide-react";
import { ConfirmDelete } from "@/components/data/confirm-delete";
import { EmptyState } from "@/components/data/empty-state";
import { ProvenanceBadge } from "@/components/data/provenance";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { formatShortDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { addCategory, addSuggestedCategories, deleteAssessment, renameCategory, saveAssessment, setCategoryArchived } from "@/server/actions/wheel";
import { useServerAction } from "@/features/dashboard/use-server-action";
import { categoryHistory, compareLatest, daysSince } from "./compare";
import type { WheelAssessment, WheelWorkspace } from "./types";

const tooltipStyle = { background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 };

export function WheelScreen({ ws, startNew = false }: { ws: WheelWorkspace; startNew?: boolean }) {
  const [editing, setEditing] = useState<WheelAssessment | "new" | null>(startNew ? "new" : null);
  const [managing, setManaging] = useState(false);
  const active = ws.categories.filter((c) => !c.archived_at).sort((a, b) => a.sort_order - b.sort_order);
  const rows = useMemo(() => compareLatest(ws.categories, ws.assessments), [ws]);
  const [latest, previous] = ws.assessments;
  const since = daysSince(ws.assessments, ws.today);
  const [historyCat, setHistoryCat] = useState(active[0]?.id ?? "");
  const history = categoryHistory(historyCat, ws.assessments);
  const { pending, run } = useServerAction();

  useEffect(() => {
    const onNew = () => setEditing("new");
    window.addEventListener("lifeos:new-assessment", onNew);
    return () => window.removeEventListener("lifeos:new-assessment", onNew);
  }, []);

  if (!active.length) {
    return (
      <Card>
        <EmptyState icon={Orbit} title="Choose the areas of your life to rate" action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="sm" disabled={pending} onClick={() => run(() => addSuggestedCategories())}>Start with 10 common areas</Button>
            <Button size="sm" variant="outline" onClick={() => setManaging(true)}>Make my own</Button>
          </div>
        }>
          The Wheel of Life is a quick self-check: rate each area from 1 to 10, now and where you&apos;d like it to be. You can rename or remove any area later.
        </EmptyState>
        <CategoryDialog open={managing} onOpenChange={setManaging} ws={ws} />
      </Card>
    );
  }

  // Only areas rated in the latest check-in; an unrated area is not a zero.
  const radarData = rows.filter((r) => r.score !== null).map((r) => ({
    name: r.name.split(" & ")[0],
    score: r.score,
    desired: r.desired,
    previous: previous?.ratings.find((x) => x.category_id === r.id)?.score ?? null,
  }));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[13px] text-muted-foreground">
          {latest ? <>Last check-in {formatShortDate(latest.assessed_on, ws.locale)}{since !== null && since >= 90 ? " · it's been a while; a quarterly check-in keeps the picture current" : ""}</> : "No check-ins yet."}
        </p>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setManaging(true)}><Pencil /> Areas</Button>
          <Button size="sm" onClick={() => setEditing("new")}><Plus /> New check-in</Button>
        </div>
      </div>

      {!latest ? (
        <Card>
          <EmptyState icon={Orbit} title="No check-in yet" action={<Button size="sm" onClick={() => setEditing("new")}><Plus /> Rate your areas</Button>}>
            It takes about two minutes. There are no right answers and no overall score.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Balance</CardTitle>
                <CardDescription>Your own 1–10 ratings. A reflection tool, not a measurement.</CardDescription>
              </div>
              <ProvenanceBadge source={latest.source} />
            </CardHeader>
            <CardContent>
              <div className="h-72" role="img" aria-label={`Ratings: ${rows.map((r) => `${r.name} ${r.score ?? "not rated"}`).join(", ")}`}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} outerRadius="72%">
                    <PolarGrid stroke="var(--color-border)" />
                    <PolarAngleAxis dataKey="name" tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} />
                    <PolarRadiusAxis domain={[0, 10]} tickCount={6} tick={false} axisLine={false} />
                    <Radar name="Desired" dataKey="desired" stroke="var(--color-chart-5)" strokeDasharray="3 3" fill="none" />
                    {previous && <Radar name={formatShortDate(previous.assessed_on, ws.locale)} dataKey="previous" stroke="var(--color-chart-3)" fill="none" strokeWidth={1} />}
                    <Radar name="Now" dataKey="score" stroke="var(--color-chart-1)" fill="var(--color-chart-1)" fillOpacity={0.18} strokeWidth={1.75} />
                    <Tooltip contentStyle={tooltipStyle} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1"><span className="h-0.5 w-3 bg-chart-1" /> Now</span>
                {previous && <span className="inline-flex items-center gap-1"><span className="h-0.5 w-3 bg-chart-3" /> {formatShortDate(previous.assessed_on, ws.locale)}</span>}
                <span className="inline-flex items-center gap-1"><span className="h-0 w-3 border-t border-dashed border-chart-5" /> Where you want it</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><div><CardTitle>By area</CardTitle><CardDescription>Gap = where you want it minus now.</CardDescription></div></CardHeader>
            <CardContent className="px-0">
              <table className="w-full text-[13px]">
                <thead className="text-[11px] text-muted-foreground">
                  <tr className="border-b border-border"><th className="px-5 py-1.5 text-left font-normal">Area</th><th className="px-2 font-normal">Now</th><th className="px-2 font-normal">Want</th><th className="px-2 font-normal">Gap</th><th className="px-5 font-normal">Change</th></tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const linked = ws.goals.filter((g) => g.wheel_category_id === r.id && g.status === "active");
                    return (
                      <tr key={r.id} className="border-b border-border/60 last:border-0">
                        <td className="px-5 py-2">
                          {r.name}
                          {linked.length > 0 && <Link href="/goals" className="block text-[11px] text-muted-foreground hover:text-foreground">{linked.length} goal{linked.length > 1 ? "s" : ""}: {linked.map((g) => g.title).join(", ")}</Link>}
                        </td>
                        <td className="tabular px-2 text-center">{r.score ?? "–"}</td>
                        <td className="tabular px-2 text-center text-muted-foreground">{r.desired ?? "–"}</td>
                        <td className={cn("tabular px-2 text-center", r.gap !== null && r.gap >= 3 && "font-medium text-warning")}>{r.gap ?? "–"}</td>
                        <td className="tabular px-5 text-center">
                          {r.change === null ? <span className="text-subtle-foreground">–</span> : r.change === 0 ? "0" : (
                            <span className={cn("inline-flex items-center gap-0.5", r.change > 0 ? "text-success" : "text-destructive")}>
                              {r.change > 0 ? <ArrowUp className="size-3" aria-label="up" /> : <ArrowDown className="size-3" aria-label="down" />}{Math.abs(r.change)}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="px-5 pt-3 text-[11px] text-muted-foreground">Large gaps are good candidates for a goal. Linking a goal to an area shows it here.</p>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <div><CardTitle>Over time</CardTitle><CardDescription>{history.length < 2 ? "A trend appears after two check-ins." : `${history.length} check-ins`}</CardDescription></div>
              <NativeSelect aria-label="Area to chart" className="w-auto" value={historyCat} onChange={(e) => setHistoryCat(e.target.value)}>
                {active.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </NativeSelect>
            </CardHeader>
            <CardContent>
              {history.length >= 2 ? (
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={history} margin={{ left: -24, right: 8, top: 8 }}>
                      <CartesianGrid stroke="var(--color-border)" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={(d) => formatShortDate(d, ws.locale)} tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 10]} ticks={[0, 5, 10]} tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} labelFormatter={(d) => formatShortDate(String(d), ws.locale)} />
                      <Line dataKey="desired" name="Want" stroke="var(--color-chart-5)" strokeDasharray="3 3" dot={false} />
                      <Line dataKey="score" name="Now" stroke="var(--color-chart-1)" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-[13px] text-muted-foreground">Check in again in a few weeks or months to see how this area changes.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {ws.assessments.length > 0 && (
        <section aria-label="Past check-ins" className="grid gap-2">
          <h2 className="label-caps">Check-ins</h2>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
            {ws.assessments.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                <span className="tabular shrink-0 sm:w-28">{formatShortDate(a.assessed_on, ws.locale)}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{a.note ?? `${a.ratings.length} areas rated`}</span>
                <ProvenanceBadge source={a.source} />
                <Button variant="ghost" size="icon-sm" onClick={() => setEditing(a)} aria-label={`Edit check-in of ${formatShortDate(a.assessed_on, ws.locale)}`}><Pencil /></Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "New check-in" : "Edit check-in"}</DialogTitle>
            <DialogDescription>1 = very unsatisfied, 10 = couldn&apos;t be better. Go with your first instinct.</DialogDescription>
          </DialogHeader>
          {editing && <AssessmentForm key={editing === "new" ? "new" : editing.id} ws={ws} assessment={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
      <CategoryDialog open={managing} onOpenChange={setManaging} ws={ws} />
    </div>
  );
}

function AssessmentForm({ ws, assessment, onDone }: { ws: WheelWorkspace; assessment: WheelAssessment | null; onDone: () => void }) {
  const active = ws.categories.filter((c) => !c.archived_at || assessment?.ratings.some((r) => r.category_id === c.id)).sort((a, b) => a.sort_order - b.sort_order);
  // New check-ins start from the last one's "want" so people only adjust what changed.
  const base = assessment ?? ws.assessments[0] ?? null;
  const [date, setDate] = useState(assessment?.assessed_on ?? ws.today);
  const [note, setNote] = useState(assessment?.note ?? "");
  const [vals, setVals] = useState(() =>
    Object.fromEntries(active.map((c) => {
      const r = base?.ratings.find((x) => x.category_id === c.id);
      return [c.id, { score: assessment ? String(r?.score ?? "") : "", desired: r?.desired_score ? String(r.desired_score) : "" }];
    })),
  );
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const { pending, run } = useServerAction();
  const rated = Object.entries(vals).filter(([, v]) => v.score);

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        run(async () => {
          const r = await saveAssessment(assessment?.id ?? null, { date, note, ratings: rated.map(([categoryId, v]) => ({ categoryId, score: v.score, desired: v.desired })) });
          if (!r.ok && r.fieldErrors) setErrors(r.fieldErrors);
          return r;
        }, { onSuccess: onDone });
      }}
    >
      <Field id="wheel-date" label="Date" error={errors.date?.[0]}>
        <Input id="wheel-date" type="date" max={ws.today} value={date} onChange={(e) => setDate(e.target.value)} className="w-auto" />
      </Field>
      <div className="grid gap-1">
        <div className="grid grid-cols-[1fr_4.5rem_4.5rem] gap-2 px-1 text-[11px] text-muted-foreground"><span>Area</span><span className="text-center">Now</span><span className="text-center">Want</span></div>
        {active.map((c) => (
          <div key={c.id} className="grid grid-cols-[1fr_4.5rem_4.5rem] items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/50">
            <span className="text-[13px]">{c.name}</span>
            {(["score", "desired"] as const).map((k) => (
              <NativeSelect key={k} aria-label={`${c.name}: ${k === "score" ? "now" : "want"}`} value={vals[c.id]?.[k] ?? ""} onChange={(e) => setVals((s) => ({ ...s, [c.id]: { ...s[c.id], [k]: e.target.value } }))} className="h-8 px-2 text-center">
                <option value="">–</option>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
              </NativeSelect>
            ))}
          </div>
        ))}
        {errors.ratings?.[0] && <p className="text-xs text-destructive">{errors.ratings[0]}</p>}
      </div>
      <Field id="wheel-note" label="Note" optional>
        <Textarea id="wheel-note" value={note} maxLength={5000} onChange={(e) => setNote(e.target.value)} className="min-h-14" placeholder="What's behind the biggest changes?" />
      </Field>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
        {assessment && (
          <span className="sm:mr-auto">
            <ConfirmDelete title="Delete this check-in?" description="Its ratings are removed from your history. This can't be undone." confirmLabel="Delete check-in" onConfirm={() => run(() => deleteAssessment(assessment.id), { onSuccess: onDone })} />
          </span>
        )}
        <span className="text-[12px] text-muted-foreground sm:ml-auto">{rated.length} of {active.length} rated</span>
        <Button type="submit" disabled={pending || !rated.length}>{pending ? "Saving…" : "Save check-in"}</Button>
      </div>
    </form>
  );
}

function CategoryDialog({ open, onOpenChange, ws }: { open: boolean; onOpenChange: (o: boolean) => void; ws: WheelWorkspace }) {
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const { pending, run } = useServerAction();
  const sorted = [...ws.categories].sort((a, b) => Number(!!a.archived_at) - Number(!!b.archived_at) || a.sort_order - b.sort_order);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Life areas</DialogTitle>
          <DialogDescription>Archiving an area keeps its past ratings.</DialogDescription>
        </DialogHeader>
        <ul className="grid gap-1">
          {sorted.map((c) => (
            <li key={c.id} className={cn("flex items-center gap-2 rounded-md px-1.5 py-1 text-[13px]", c.archived_at && "text-muted-foreground")}>
              {renaming?.id === c.id ? (
                <form className="flex flex-1 gap-1" onSubmit={(e) => { e.preventDefault(); run(() => renameCategory(c.id, renaming.name), { onSuccess: () => setRenaming(null) }); }}>
                  <Input autoFocus value={renaming.name} maxLength={60} onChange={(e) => setRenaming({ id: c.id, name: e.target.value })} aria-label="Area name" className="h-8" />
                  <Button size="sm" type="submit" disabled={pending}>Save</Button>
                </form>
              ) : (
                <>
                  <span className="flex-1 truncate">{c.name}{c.archived_at ? " (archived)" : ""}</span>
                  {!c.archived_at && <Button variant="ghost" size="icon-sm" aria-label={`Rename ${c.name}`} onClick={() => setRenaming({ id: c.id, name: c.name })}><Pencil /></Button>}
                  <Button variant="ghost" size="icon-sm" aria-label={c.archived_at ? `Restore ${c.name}` : `Archive ${c.name}`} disabled={pending} onClick={() => run(() => setCategoryArchived(c.id, !c.archived_at))}>
                    {c.archived_at ? <ArchiveRestore /> : <Archive />}
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) run(() => addCategory(name), { onSuccess: () => setName("") }); }}>
          <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Add an area, e.g. Faith" aria-label="New area" />
          <Button type="submit" variant="outline" disabled={pending || !name.trim()}><Plus /> Add</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
