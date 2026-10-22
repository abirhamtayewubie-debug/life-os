import { localDateKey } from "@/lib/dates";
import { rangeFor, type BodyMetric } from "@/features/health/metrics";

/**
 * Reads the export.xml from Apple Health (Health app → profile → Export All
 * Health Data). The file can be hundreds of megabytes, so it is fed in text
 * chunks and only the start tags we use are looked at. It runs in the
 * browser: the raw file never leaves the device, only the summarised rows the
 * person chooses to add.
 *
 * What it keeps, exactly as recorded:
 *   weight, body fat %, resting heart rate  → body measurements
 *   sleep analysis samples                  → one night per wake-up date
 *   workouts                                → workouts (type, start, length)
 * Nothing is estimated or filled in.
 */

export type HealthMeasurement = { metric: Extract<BodyMetric, "weight" | "body_fat_pct" | "resting_hr">; measuredAt: string; value: number; unit: string; typedIn: boolean };
export type HealthNight = { sleepDate: string; bedtime: string; wakeTime: string; awakenings: number | null; typedIn: boolean };
export type HealthWorkout = { externalId: string; activity: string; performedOn: string; startedAt: string; durationMinutes: number; notes: string | null; typedIn: boolean };
export type HealthImport = {
  measurements: HealthMeasurement[];
  nights: HealthNight[];
  workouts: HealthWorkout[];
  skipped: { reason: string; count: number }[];
  range: { from: string; to: string } | null;
};

/** Rows sent to the server per request. */
export const HEALTH_BATCH = 1500;

const QUANTITY: Record<string, HealthMeasurement["metric"]> = {
  HKQuantityTypeIdentifierBodyMass: "weight",
  HKQuantityTypeIdentifierBodyFatPercentage: "body_fat_pct",
  HKQuantityTypeIdentifierRestingHeartRate: "resting_hr",
};
const SLEEP = "HKCategoryTypeIdentifierSleepAnalysis";
const ASLEEP = /^HKCategoryValueSleepAnalysisAsleep/;
const IN_BED = "HKCategoryValueSleepAnalysisInBed";
const AWAKE = "HKCategoryValueSleepAnalysisAwake";
/** Apple's own app writes "Health" as the source when a value is typed in by hand. */
const TYPED_IN_SOURCE = "Health";

const ACTIVITY_NAMES: Record<string, string> = {
  TraditionalStrengthTraining: "Strength training",
  FunctionalStrengthTraining: "Functional strength training",
  HighIntensityIntervalTraining: "HIIT",
  MixedCardio: "Mixed cardio",
  CoreTraining: "Core training",
  MindAndBody: "Mind and body",
  StairClimbing: "Stair climbing",
  CrossTraining: "Cross training",
  Elliptical: "Elliptical",
  Other: "Workout",
};

export function activityName(type: string): string {
  const raw = type.replace(/^HKWorkoutActivityType/, "");
  if (ACTIVITY_NAMES[raw]) return ACTIVITY_NAMES[raw];
  const words = raw.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return (words.charAt(0).toUpperCase() + words.slice(1)).slice(0, 80) || "Workout";
}

/** "2026-01-05 07:12:00 +0300" → ISO instant. */
export function appleDate(s: string | undefined): Date | null {
  const m = s?.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-])(\d{2})(\d{2})$/);
  if (!m) return null;
  const d = new Date(`${m[1]}T${m[2]}${m[3]}${m[4]}:${m[5]}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function attrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/([A-Za-z_:][\w:.-]*)="([^"]*)"/g)) out[m[1]] = m[2].replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  return out;
}

type SleepSample = { start: number; end: number; kind: "asleep" | "inbed" | "awake"; typedIn: boolean };
type OpenWorkout = { a: Record<string, string>; distance?: { v: number; unit: string }; energy?: { v: number; unit: string } };

export class AppleHealthReader {
  private carry = "";
  private measurements: HealthMeasurement[] = [];
  private sleep: SleepSample[] = [];
  private workouts: HealthWorkout[] = [];
  private open: OpenWorkout | null = null;
  private skipped = new Map<string, number>();
  readonly since: number;

  constructor(private timeZone: string, since: Date | null) {
    this.since = since ? since.getTime() : -Infinity;
  }

  private skip(reason: string) {
    this.skipped.set(reason, (this.skipped.get(reason) ?? 0) + 1);
  }

  /** Feed the next piece of the file; tags split across pieces are kept for the next call. */
  feed(chunk: string) {
    const text = this.carry + chunk;
    const last = text.lastIndexOf(">");
    if (last < 0) { this.carry = text.slice(-100_000); return; }
    this.carry = text.slice(last + 1);
    const body = text.slice(0, last + 1);
    for (const m of body.matchAll(/<(\/?)(Record|Workout|WorkoutStatistics)\b([^>]*)>/g)) {
      if (m[1]) { if (m[2] === "Workout") this.closeWorkout(); continue; }
      if (m[2] === "Record") this.record(m[3]);
      else if (m[2] === "Workout") { this.closeWorkout(); this.open = { a: attrs(m[3]) }; if (m[3].trimEnd().endsWith("/")) this.closeWorkout(); }
      else if (this.open) this.statistic(attrs(m[3]));
    }
  }

  private record(raw: string) {
    const typeMatch = raw.match(/\btype="([^"]+)"/);
    const type = typeMatch?.[1];
    if (!type || (!QUANTITY[type] && type !== SLEEP)) return;
    const a = attrs(raw);
    const start = appleDate(a.startDate);
    const end = appleDate(a.endDate);
    if (!start || !end) { this.skip("Entries with unreadable dates"); return; }
    if (end.getTime() < this.since) return;
    const typedIn = a.sourceName === TYPED_IN_SOURCE;

    if (type === SLEEP) {
      const kind = ASLEEP.test(a.value ?? "") ? "asleep" : a.value === IN_BED ? "inbed" : a.value === AWAKE ? "awake" : null;
      if (kind && end > start) this.sleep.push({ start: start.getTime(), end: end.getTime(), kind, typedIn });
      return;
    }

    const metric = QUANTITY[type];
    let value = Number(a.value);
    let unit = a.unit ?? "";
    if (!Number.isFinite(value)) { this.skip("Entries with unreadable values"); return; }
    if (metric === "weight") {
      if (unit === "g") { value /= 1000; unit = "kg"; }
      else if (unit === "st") { value *= 6.35029318; unit = "kg"; }
      else if (unit !== "kg" && unit !== "lb") { this.skip("Weights in units this app doesn't use"); return; }
    } else if (metric === "body_fat_pct") {
      // Apple stores body fat as a fraction (0.21 = 21 %).
      if (unit !== "%") { this.skip("Body fat in units this app doesn't use"); return; }
      value = value <= 1 ? value * 100 : value;
    } else {
      if (unit !== "count/min") { this.skip("Heart rates in units this app doesn't use"); return; }
      unit = "bpm";
    }
    value = Math.round(value * 100) / 100;
    const range = rangeFor(metric, unit);
    if (range && (value < range[0] || value > range[1])) { this.skip("Values outside the range this app accepts"); return; }
    this.measurements.push({ metric, measuredAt: start.toISOString(), value, unit, typedIn });
  }

  private statistic(a: Record<string, string>) {
    const sum = Number(a.sum);
    if (!this.open || !Number.isFinite(sum)) return;
    if (/Distance/.test(a.type ?? "")) this.open.distance = { v: sum, unit: a.unit ?? "" };
    else if (a.type === "HKQuantityTypeIdentifierActiveEnergyBurned") this.open.energy = { v: sum, unit: a.unit ?? "" };
  }

  private closeWorkout() {
    const w = this.open;
    this.open = null;
    if (!w) return;
    const start = appleDate(w.a.startDate);
    const end = appleDate(w.a.endDate);
    if (!start || !end) { this.skip("Entries with unreadable dates"); return; }
    if (end.getTime() < this.since) return;
    let minutes = Number(w.a.duration);
    const unit = w.a.durationUnit ?? "min";
    if (!Number.isFinite(minutes)) minutes = (end.getTime() - start.getTime()) / 60_000;
    else if (unit === "s") minutes /= 60;
    else if (unit === "hr" || unit === "h") minutes *= 60;
    minutes = Math.round(minutes);
    if (minutes < 1 || minutes > 1440) { this.skip("Workouts shorter than a minute or longer than a day"); return; }
    // Older exports put totals on the workout itself.
    const distance = w.distance ?? (w.a.totalDistance ? { v: Number(w.a.totalDistance), unit: w.a.totalDistanceUnit ?? "" } : undefined);
    const energy = w.energy ?? (w.a.totalEnergyBurned ? { v: Number(w.a.totalEnergyBurned), unit: w.a.totalEnergyBurnedUnit ?? "" } : undefined);
    const extras = [
      distance && distance.v > 0 ? `${Math.round(distance.v * 100) / 100} ${distance.unit}` : null,
      energy && energy.v > 0 ? `${Math.round(energy.v)} ${energy.unit === "Cal" ? "kcal" : energy.unit}` : null,
      w.a.sourceName ? `from ${w.a.sourceName}` : null,
    ].filter(Boolean);
    const type = w.a.workoutActivityType ?? "HKWorkoutActivityTypeOther";
    this.workouts.push({
      externalId: `apple-health:${type}:${start.toISOString()}`,
      activity: activityName(type),
      performedOn: localDateKey(start, this.timeZone),
      startedAt: start.toISOString(),
      durationMinutes: minutes,
      notes: extras.length ? `Apple Health: ${extras.join(" · ")}`.slice(0, 2000) : null,
      typedIn: w.a.sourceName === TYPED_IN_SOURCE,
    });
  }

  /** Groups sleep samples into nights: samples less than 2 hours apart belong together. */
  private nights(): HealthNight[] {
    const samples = this.sleep.sort((a, b) => a.start - b.start);
    const sessions: SleepSample[][] = [];
    let cur: SleepSample[] = [];
    let curEnd = -Infinity;
    for (const s of samples) {
      if (cur.length && s.start - curEnd > 2 * 3600_000) { sessions.push(cur); cur = []; curEnd = -Infinity; }
      cur.push(s);
      curEnd = Math.max(curEnd, s.end);
    }
    if (cur.length) sessions.push(cur);

    const byDate = new Map<string, HealthNight & { minutes: number }>();
    for (const ses of sessions) {
      // Prefer what the watch or phone saw as asleep; fall back to time in bed.
      const asleep = ses.filter((s) => s.kind === "asleep");
      const span = asleep.length ? asleep : ses.filter((s) => s.kind === "inbed");
      if (!span.length) continue;
      const bed = Math.min(...span.map((s) => s.start));
      const wake = Math.max(...span.map((s) => s.end));
      const minutes = (wake - bed) / 60_000;
      if (minutes < 60) { this.skip("Naps and sleep under an hour"); continue; }
      if (minutes >= 24 * 60) { this.skip("Sleep records of a day or longer"); continue; }
      const hasStages = ses.some((s) => s.kind === "awake");
      const awakenings = hasStages ? Math.min(50, ses.filter((s) => s.kind === "awake" && s.start > bed && s.end < wake).length) : null;
      const sleepDate = localDateKey(new Date(wake), this.timeZone);
      const night = { sleepDate, bedtime: new Date(bed).toISOString(), wakeTime: new Date(wake).toISOString(), awakenings, typedIn: span.every((s) => s.typedIn), minutes };
      const prev = byDate.get(sleepDate);
      if (prev) this.skip("Shorter second sleeps on the same day");
      if (!prev || prev.minutes < minutes) byDate.set(sleepDate, night);
    }
    return [...byDate.values()].map(({ minutes: _m, ...n }) => n);
  }

  finish(): HealthImport {
    this.feed(">"); // flush a final tag without a trailing newline
    this.closeWorkout();
    // The same reading from two apps at the same moment: keep one.
    const seen = new Set<string>();
    const measurements = this.measurements.filter((m) => {
      const k = `${m.metric}|${m.measuredAt}|${m.typedIn}`;
      if (seen.has(k)) { this.skip("Duplicate readings at the same moment"); return false; }
      seen.add(k);
      return true;
    });
    const wSeen = new Set<string>();
    const workouts = this.workouts.filter((w) => (wSeen.has(w.externalId) ? false : (wSeen.add(w.externalId), true)));
    const nights = this.nights();
    const dates = [...measurements.map((m) => m.measuredAt), ...nights.map((n) => n.wakeTime), ...workouts.map((w) => w.startedAt)].sort();
    return {
      measurements, nights, workouts,
      skipped: [...this.skipped.entries()].map(([reason, count]) => ({ reason, count })),
      range: dates.length ? { from: localDateKey(new Date(dates[0]), this.timeZone), to: localDateKey(new Date(dates[dates.length - 1]), this.timeZone) } : null,
    };
  }
}
