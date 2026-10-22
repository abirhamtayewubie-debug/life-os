"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { HeartPulse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/input";
import { AppleHealthReader, HEALTH_BATCH, type HealthImport } from "@/lib/apple-health";
import { importHealthBatch, type HealthImportCounts } from "@/server/actions/health-import";
import { countBytes, openZipEntry, ZipError } from "./zip-entry";

const SINCE = { "3m": 92, "12m": 366, "2y": 731, all: null } as const;
type Since = keyof typeof SINCE;

type Kind = "weight" | "body_fat_pct" | "resting_hr" | "nights" | "workouts";
const KIND_LABEL: Record<Kind, string> = {
  weight: "Weight", body_fat_pct: "Body fat", resting_hr: "Resting heart rate", nights: "Sleep (nights)", workouts: "Workouts",
};

async function readExport(file: File, timeZone: string, since: Since, onProgress: (pct: number) => void): Promise<HealthImport> {
  const days = SINCE[since];
  const reader = new AppleHealthReader(timeZone, days === null ? null : new Date(Date.now() - days * 86_400_000));
  let stream: ReadableStream<Uint8Array>;
  let total = file.size;
  const progress = (n: number) => onProgress(Math.min(99, Math.floor((n / Math.max(total, 1)) * 100)));
  if (/\.zip$/i.test(file.name) || file.type === "application/zip") {
    const entry = await openZipEntry(file, (n) => n === "export.xml" || n.endsWith("/export.xml"), progress);
    if (!entry) throw new ZipError("No export.xml in this .zip. Choose the export.zip from the Health app.");
    total = entry.compressedSize;
    stream = entry.stream;
  } else {
    stream = (file.stream() as ReadableStream<Uint8Array>).pipeThrough(countBytes(progress));
  }
  const text = stream.pipeThrough(new TextDecoderStream() as unknown as ReadableWritablePair<string, Uint8Array>).getReader();
  for (;;) {
    const { done, value } = await text.read();
    if (done) break;
    reader.feed(value);
  }
  return reader.finish();
}

export function AppleHealthImport({ timeZone, demo, triggerLabel = "Import from Apple Health" }: { timeZone: string; demo: boolean; triggerLabel?: string }) {
  const router = useRouter();
  const [since, setSince] = useState<Since>("12m");
  const [result, setResult] = useState<{ file: string; data: HealthImport } | null>(null);
  const [include, setInclude] = useState<Record<Kind, boolean>>({ weight: true, body_fat_pct: true, resting_hr: true, nights: true, workouts: true });
  const [reading, setReading] = useState<number | null>(null);
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  async function read(f: File | null, s: Since) {
    setResult(null);
    setError(null);
    if (!f) return;
    if (!/\.(zip|xml)$/i.test(f.name)) return setError("Choose the export.zip from the Health app, or the export.xml inside it.");
    setReading(0);
    try {
      const data = await readExport(f, timeZone, s, setReading);
      setResult({ file: f.name, data });
      setInclude({ weight: true, body_fat_pct: true, resting_hr: true, nights: true, workouts: true });
    } catch (e) {
      setError(e instanceof ZipError ? e.message : "That file couldn't be read. If it's a .zip, try unzipping it and choosing export.xml.");
    } finally {
      setReading(null);
    }
  }

  const counts = result && {
    weight: result.data.measurements.filter((m) => m.metric === "weight").length,
    body_fat_pct: result.data.measurements.filter((m) => m.metric === "body_fat_pct").length,
    resting_hr: result.data.measurements.filter((m) => m.metric === "resting_hr").length,
    nights: result.data.nights.length,
    workouts: result.data.workouts.length,
  };
  const chosen = counts ? (Object.keys(counts) as Kind[]).filter((k) => include[k]).reduce((n, k) => n + counts[k], 0) : 0;

  async function save() {
    if (!result) return;
    const measurements = result.data.measurements.filter((m) => include[m.metric]);
    const nights = include.nights ? result.data.nights : [];
    const workouts = include.workouts ? result.data.workouts : [];
    const queue = [
      ...measurements.map((r) => ["measurements", r] as const),
      ...nights.map((r) => ["nights", r] as const),
      ...workouts.map((r) => ["workouts", r] as const),
    ];
    const added: HealthImportCounts = { measurements: 0, nights: 0, workouts: 0 };
    setSaving(0);
    try {
      for (let i = 0; i < queue.length; i += HEALTH_BATCH) {
        const part = queue.slice(i, i + HEALTH_BATCH);
        const r = await importHealthBatch({
          measurements: part.flatMap(([k, v]) => (k === "measurements" ? [v] : [])),
          nights: part.flatMap(([k, v]) => (k === "nights" ? [v] : [])),
          workouts: part.flatMap(([k, v]) => (k === "workouts" ? [v] : [])),
        });
        if (!r.ok) {
          if (r.demo) toast(r.error, { description: "Try it after connecting a database." });
          else toast.error(i ? `${r.error} Earlier parts were saved; importing again adds only what's missing.` : r.error);
          return;
        }
        added.measurements += r.data?.measurements ?? 0;
        added.nights += r.data?.nights ?? 0;
        added.workouts += r.data?.workouts ?? 0;
        setSaving(Math.round(((i + part.length) / queue.length) * 100));
      }
      const total = added.measurements + added.nights + added.workouts;
      const already = queue.length - total;
      toast.success(total === 0 ? "Nothing new: all of this is already in Life OS." : `Added ${added.measurements} measurements, ${added.nights} nights and ${added.workouts} workouts${already ? `; ${already} were already here` : ""}.`);
      setResult(null);
      setFile(null);
      router.refresh();
    } catch {
      toast.error("Something went wrong while saving. Importing again adds only what's missing.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline"><HeartPulse /> {triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import from Apple Health</DialogTitle>
          <DialogDescription>Weight, body fat, resting heart rate, sleep and workouts, exactly as recorded.</DialogDescription>
        </DialogHeader>
        <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
          <li>On your iPhone, open Health, tap your picture, then Export All Health Data.</li>
          <li>Save or send export.zip to the device you&apos;re using now.</li>
          <li>Choose it below. You can also unzip it and choose export.xml.</li>
        </ol>
        {demo && <p className="rounded-md border border-dashed border-border p-2 text-xs text-muted-foreground">Demo mode: you can preview a file, but nothing is saved.</p>}
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <label htmlFor="ah-since" className="text-xs font-medium">Import data from</label>
            <NativeSelect id="ah-since" value={since} disabled={reading !== null} onChange={(e) => { const s = e.target.value as Since; setSince(s); void read(file, s); }}>
              <option value="3m">The last 3 months</option>
              <option value="12m">The last 12 months</option>
              <option value="2y">The last 2 years</option>
              <option value="all">Everything</option>
            </NativeSelect>
          </div>
          <div className="grid min-w-0 gap-1">
            <label htmlFor="ah-file" className="text-xs font-medium">Health export (.zip or .xml)</label>
            <input
              id="ah-file"
              type="file"
              accept=".zip,.xml,application/zip,text/xml,application/xml"
              disabled={reading !== null || saving !== null}
              className="min-w-0 text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-foreground"
              onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); void read(f, since); }}
            />
          </div>
        </div>
        <div aria-live="polite" className="grid gap-2">
          {reading !== null && <p className="text-sm text-muted-foreground">Reading the export on this device… {reading}%</p>}
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          {result && counts && (
            chosen === 0 && Object.values(counts).every((c) => c === 0) ? (
              <p className="text-sm">Nothing this app imports was found in that period. Try a longer period, or check that the export is from the Health app.</p>
            ) : (
              <div className="grid min-w-0 gap-2 rounded-md border border-border p-3">
                <p className="text-sm">
                  Found in {result.file}{result.data.range ? `, ${result.data.range.from} to ${result.data.range.to}` : ""}:
                </p>
                <fieldset className="grid min-w-0 gap-1">
                  <legend className="sr-only">What to add</legend>
                  {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                    <label key={k} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={include[k] && counts[k] > 0} disabled={counts[k] === 0 || saving !== null} onChange={(e) => setInclude({ ...include, [k]: e.target.checked })} />
                      {KIND_LABEL[k]}: {counts[k]}
                    </label>
                  ))}
                </fieldset>
                {result.data.skipped.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">Left out</p>
                    <ul className="list-disc pl-4">{result.data.skipped.map((s) => <li key={s.reason}>{s.reason}: {s.count}</li>)}</ul>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Readings from a device are marked “Device”; ones typed into the Health app by hand are marked “Imported”. Importing the same export again adds only what&apos;s new.
                </p>
                <Button className="justify-self-start" disabled={chosen === 0 || saving !== null} onClick={save}>
                  {saving !== null ? `Adding… ${saving}%` : `Add ${chosen} item${chosen === 1 ? "" : "s"}`}
                </Button>
              </div>
            )
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          The export is read on this device. Only the items counted above are sent to Life OS; everything else in it (steps, heart-rate samples, medical records, locations) stays on your device.
        </p>
      </DialogContent>
    </Dialog>
  );
}
