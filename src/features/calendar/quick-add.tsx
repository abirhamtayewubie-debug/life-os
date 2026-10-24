"use client";

import { useState } from "react";
import { CornerDownLeft, SlidersHorizontal, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatShortDate } from "@/lib/dates";
import { parseQuickEvent, quickReminderAt } from "@/lib/quick-event";
import { createEvent } from "@/server/actions/calendar";
import { createReminder } from "@/server/actions/reminders";
import { useServerAction } from "@/features/dashboard/use-server-action";
import type { EventDraft } from "./event-form";

/**
 * One line to add an event: type it, check the preview, press Enter. Anything
 * more (kind, notes, a custom repeat) goes through "More options", which opens
 * the full form with what was typed already filled in.
 */
export function QuickAdd({ today, locale, onMore }: { today: string; locale: string; onMore: (draft: EventDraft) => void }) {
  const [text, setText] = useState("");
  const { pending, run } = useServerAction();
  const parsed = text.trim() ? parseQuickEvent(text, today) : null;
  const draft = (): EventDraft => (parsed
    ? { title: parsed.title, allDay: parsed.allDay, startDate: parsed.startDate, startTime: parsed.startTime || "09:00", endDate: parsed.endDate, endTime: parsed.endTime || "10:00", recurrenceRule: parsed.recurrenceRule, location: parsed.location }
    : { title: text.trim() });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsed) return;
    const p = parsed;
    run(async () => {
      const r = await createEvent({
        title: p.title, kind: "event", allDay: p.allDay, startDate: p.startDate, startTime: p.startTime, endDate: p.endDate, endTime: p.endTime,
        location: p.location, description: "", recurrenceRule: p.recurrenceRule, taskId: "",
      });
      if (!r.ok) return r;
      const at = quickReminderAt(p);
      if (at && r.data) {
        const rr = await createReminder({ title: p.title, date: at.date, time: at.time, eventId: r.data.id, notifyDevices: true });
        if (!rr.ok) return { ok: true as const, message: "Event added, but its reminder couldn't be set." };
      }
      return { ...r, message: at ? "Event added with a reminder." : "Event added." };
    }, { onSuccess: () => setText("") });
  };

  return (
    <form onSubmit={submit} className="grid gap-1.5">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Zap className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={400}
            className="pl-9"
            placeholder="Quick add: Lunch with Hana tomorrow 1pm 1h @ Bole remind 15m"
            aria-label="Quick add an event"
            aria-describedby="quick-add-preview"
          />
        </div>
        <Button type="submit" disabled={pending || !parsed} aria-label="Add event"><CornerDownLeft /><span className="hidden sm:inline">Add</span></Button>
        <Button type="button" variant="outline" onClick={() => { onMore(draft()); setText(""); }} aria-label="More options"><SlidersHorizontal /><span className="hidden sm:inline">More</span></Button>
      </div>
      <p id="quick-add-preview" aria-live="polite" className="min-h-4 px-1 text-[12px] text-muted-foreground">
        {parsed ? (
          <>
            <span className="font-medium text-foreground">{parsed.title}</span>
            {" · "}
            {[parsed.startDate === today ? "Today" : formatShortDate(parsed.startDate, locale), ...parsed.understood.filter((u) => u !== parsed.startDate && u !== "today")].join(" · ")}
          </>
        ) : text.trim() ? "Add a title as well as the time." : "Try “Dentist fri 3pm 30m”, “Standup weekdays 9:30-9:45” or “Holiday nov 3”."}
      </p>
    </form>
  );
}
