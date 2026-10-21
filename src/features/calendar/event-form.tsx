"use client";

import { useState } from "react";
import { Repeat, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { allDayKey, wallTime } from "@/lib/calendar";
import { addDays, localDateKey } from "@/lib/dates";
import { describeRule, parseRule, presetFromRule, ruleFromPreset, type RepeatPreset } from "@/lib/recurrence";
import { createEvent, deleteEvent, updateEvent, type EventInput } from "@/server/actions/calendar";
import { useServerAction } from "@/features/dashboard/use-server-action";
import { KIND_LABEL, type CalendarEvent } from "./types";

type Errors = Record<string, string[] | undefined>;

const REPEATS: { v: RepeatPreset; label: string }[] = [
  { v: "none", label: "Doesn't repeat" },
  { v: "daily", label: "Every day" },
  { v: "weekdays", label: "Every weekday" },
  { v: "weekly", label: "Every week" },
  { v: "biweekly", label: "Every 2 weeks" },
  { v: "monthly", label: "Every month" },
  { v: "yearly", label: "Every year" },
];

export type EventDraft = Partial<EventInput>;

function addMinutes(date: string, time: string, minutes: number): { date: string; time: string } {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const dayShift = Math.floor(total / 1440);
  const t = ((total % 1440) + 1440) % 1440;
  return { date: addDays(date, dayShift), time: `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}` };
}

export function draftFor(date: string, time = "09:00", minutes = 60, extra: EventDraft = {}): EventDraft {
  const end = addMinutes(date, time, minutes);
  return { startDate: date, startTime: time, endDate: end.date, endTime: end.time, ...extra };
}

function initial(event: CalendarEvent | null, draft: EventDraft, tz: string): EventInput {
  if (!event) {
    return { title: "", kind: "event", allDay: false, startDate: "", startTime: "09:00", endDate: "", endTime: "10:00", location: "", description: "", recurrenceRule: "", taskId: "", ...draft } as EventInput;
  }
  const ez = event.timezone || tz;
  return {
    title: event.title,
    kind: event.kind === "reminder_only" ? "event" : event.kind,
    allDay: event.all_day,
    startDate: event.all_day ? allDayKey(event.starts_at) : localDateKey(new Date(event.starts_at), ez),
    startTime: event.all_day ? "09:00" : wallTime(event.starts_at, ez),
    endDate: event.all_day ? allDayKey(event.ends_at) : localDateKey(new Date(event.ends_at), ez),
    endTime: event.all_day ? "10:00" : wallTime(event.ends_at, ez),
    location: event.location ?? "",
    description: event.description ?? "",
    recurrenceRule: event.recurrence_rule ?? "",
    taskId: event.task_id ?? "",
  };
}

export function EventForm({
  event, draft = {}, tz, onDone, onCancel, taskTitle,
}: {
  event: CalendarEvent | null;
  draft?: EventDraft;
  tz: string;
  taskTitle?: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState<EventInput>(() => initial(event, draft, tz));
  const [errors, setErrors] = useState<Errors>({});
  const { pending, run } = useServerAction();
  const set = <K extends keyof EventInput>(k: K, val: EventInput[K]) => setV((s) => ({ ...s, [k]: val }));
  const readOnly = !!event?.external_provider;
  const err = (k: string) => errors[k]?.[0];

  const preset = presetFromRule(v.recurrenceRule);
  const ruleText = (() => {
    try {
      return v.recurrenceRule ? describeRule(parseRule(v.recurrenceRule)) : null;
    } catch {
      return null;
    }
  })();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    run(
      async () => {
        const r = event ? await updateEvent(event.id, v) : await createEvent(v);
        if (!r.ok && r.fieldErrors) setErrors(r.fieldErrors);
        return r;
      },
      { onSuccess: onDone },
    );
  };

  const setStart = (date: string, time: string | undefined) =>
    setV((s) => {
      // Keep the duration when the start moves, like most calendars do.
      const oldStart = `${s.startDate}T${s.startTime || "00:00"}`;
      const oldEnd = `${s.endDate}T${s.endTime || "00:00"}`;
      const durMin = s.startDate && s.endDate ? Math.max(0, (Date.parse(`${oldEnd}Z`) - Date.parse(`${oldStart}Z`)) / 60000) : 60;
      const end = addMinutes(date, time || "00:00", s.allDay ? Math.round(durMin / 1440) * 1440 : durMin);
      const p = presetFromRule(s.recurrenceRule);
      const rule = date && p !== "none" && p !== "custom" ? ruleFromPreset(p, date) ?? "" : s.recurrenceRule;
      return { ...s, startDate: date, startTime: time ?? s.startTime, endDate: end.date, endTime: s.allDay ? s.endTime : end.time, recurrenceRule: rule };
    });

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      {taskTitle && (
        <p className="rounded-md bg-accent/60 px-3 py-2 text-[13px] text-accent-foreground">Blocking time for <span className="font-medium">{taskTitle}</span></p>
      )}
      {readOnly && (
        <p className="rounded-md bg-muted px-3 py-2 text-[13px] text-muted-foreground">This event comes from a connected calendar and can only be changed there.</p>
      )}
      <fieldset disabled={readOnly} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="event-title">Title</Label>
          <Input id="event-title" autoFocus value={v.title} maxLength={300} onChange={(e) => set("title", e.target.value)} aria-invalid={!!err("title")} placeholder="What's happening?" />
          {err("title") && <p className="text-xs text-destructive">{err("title")}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="event-kind">Type</Label>
            <NativeSelect id="event-kind" className="w-auto" value={v.kind} onChange={(e) => set("kind", e.target.value as EventInput["kind"])}>
              {(["event", "meeting", "appointment", "time_block"] as const).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </NativeSelect>
          </div>
          <label className="mt-5 flex cursor-pointer items-center gap-2 text-[13px]">
            <Switch checked={!!v.allDay} onCheckedChange={(c) => set("allDay", c)} aria-label="All day" /> All day
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="event-start-date">Starts</Label>
            <div className="flex gap-2">
              <Input id="event-start-date" type="date" value={v.startDate} onChange={(e) => setStart(e.target.value, v.startTime || undefined)} aria-invalid={!!err("startDate")} />
              {!v.allDay && <Input type="time" className="w-28" value={v.startTime} onChange={(e) => setStart(v.startDate, e.target.value)} aria-label="Start time" aria-invalid={!!err("startTime")} />}
            </div>
            {(err("startDate") || err("startTime")) && <p className="text-xs text-destructive">{err("startDate") ?? err("startTime")}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="event-end-date">Ends</Label>
            <div className="flex gap-2">
              <Input id="event-end-date" type="date" value={v.endDate} min={v.startDate} onChange={(e) => set("endDate", e.target.value)} aria-invalid={!!err("endDate")} />
              {!v.allDay && <Input type="time" className="w-28" value={v.endTime} onChange={(e) => set("endTime", e.target.value)} aria-label="End time" aria-invalid={!!err("endTime")} />}
            </div>
            {(err("endDate") || err("endTime")) && <p className="text-xs text-destructive">{err("endDate") ?? err("endTime")}</p>}
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="event-repeat">Repeat</Label>
          <NativeSelect
            id="event-repeat"
            value={preset}
            onChange={(e) => {
              const p = e.target.value as RepeatPreset | "custom";
              if (p !== "custom") set("recurrenceRule", ruleFromPreset(p, v.startDate || localDateKey(new Date(), tz)) ?? "");
            }}
            aria-invalid={!!err("recurrenceRule")}
          >
            {REPEATS.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
            {preset === "custom" && <option value="custom">{ruleText ?? "Custom"}</option>}
          </NativeSelect>
          {ruleText && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Repeat className="size-3" aria-hidden /> {ruleText}, at the same local time in {tz.replace(/_/g, " ")}.</p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="event-location">Location</Label>
          <Input id="event-location" value={v.location} maxLength={300} onChange={(e) => set("location", e.target.value)} placeholder="Optional" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="event-notes">Notes</Label>
          <Textarea id="event-notes" value={v.description} maxLength={10000} onChange={(e) => set("description", e.target.value)} className="min-h-16" />
        </div>
      </fieldset>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
        {event && !readOnly && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive sm:mr-auto"><Trash2 /> Delete</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogTitle>Delete “{event.title}”?</AlertDialogTitle>
              <AlertDialogDescription>
                {event.recurrence_rule ? "This deletes every occurrence in the series. " : ""}This can&apos;t be undone.
              </AlertDialogDescription>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep it</AlertDialogCancel>
                <AlertDialogAction onClick={() => run(() => deleteEvent(event.id), { onSuccess: onDone })}>Delete event</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        <Button type="button" variant="outline" className="sm:ml-auto" onClick={onCancel}>{readOnly ? "Close" : "Cancel"}</Button>
        {!readOnly && <Button type="submit" disabled={pending}>{pending ? "Saving…" : event ? "Save changes" : "Add to calendar"}</Button>}
      </div>
    </form>
  );
}
