"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Download, FileUp, Link2, Link2Off, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useServerAction } from "@/features/dashboard/use-server-action";
import { parseIcs, type IcsParseResult } from "@/lib/ics";
import { createCalendarFeed, importCalendarEvents, revokeCalendarFeed } from "@/server/actions/calendar-files";

export type FeedStatus = { exists: boolean; createdAt: string | null; lastUsedAt: string | null };

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export function CalendarFiles({ timezone, locale, feed, demo }: { timezone: string; locale: string; feed: FeedStatus; demo: boolean }) {
  const router = useRouter();
  const { pending, run } = useServerAction();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; result: IcsParseResult } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function pick(f: File | undefined) {
    setFile(null);
    setFileError(null);
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) return setFileError("That file is larger than 5 MB. Export a shorter date range and try again.");
    const text = await f.text();
    if (!/BEGIN:VCALENDAR/i.test(text)) return setFileError("That doesn't look like a calendar (.ics) file.");
    setFile({ name: f.name, result: parseIcs(text, timezone) });
  }

  function importNow() {
    if (!file) return;
    run(() => importCalendarEvents({ fileName: file.name, events: file.result.events }), {
      onSuccess: () => {
        setFile(null);
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      },
    });
  }

  const fmt = (iso: string) => new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
  const preview = file?.result.events.slice(0, 5) ?? [];

  return (
    <Dialog onOpenChange={(open) => { if (!open) { setLink(null); setCopied(false); } }}>
      <DialogTrigger asChild>
        <Button variant="outline"><FileUp /> Import &amp; export</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Calendar files</DialogTitle>
          <DialogDescription>Bring events in from another calendar, or take yours with you.</DialogDescription>
        </DialogHeader>

        <section aria-labelledby="ics-import" className="grid min-w-0 gap-2">
          <h3 id="ics-import" className="text-sm font-medium">Import a calendar file</h3>
          <p className="text-xs text-muted-foreground">
            An .ics file exported from Google Calendar, Apple Calendar or Outlook. It&apos;s read on this device; only the events you add are sent. Importing the same file again adds only new events.
          </p>
          <label className="text-xs font-medium" htmlFor="ics-file">Calendar file (.ics)</label>
          <input
            ref={fileRef}
            id="ics-file"
            type="file"
            accept=".ics,text/calendar"
            className="min-w-0 text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-foreground"
            onChange={(e) => pick(e.target.files?.[0])}
          />
          {fileError && <p role="alert" className="text-xs text-destructive">{fileError}</p>}
          {file && (
            <div className="grid min-w-0 gap-2 rounded-xl border border-border p-3" aria-live="polite">
              <p className="text-sm">
                {file.result.events.length === 0 ? "No events this app can add were found" : `${file.result.events.length} event${file.result.events.length === 1 ? "" : "s"} found`}
                {file.result.calendarName ? ` in “${file.result.calendarName}”` : ""}.
              </p>
              {preview.length > 0 && (
                <ul className="grid gap-1 text-xs text-muted-foreground" aria-label="First events in the file">
                  {preview.map((e) => (
                    <li key={e.uid} className="truncate">
                      <span className="text-foreground">{e.title}</span> · {e.allDay ? new Date(e.startsAt).toLocaleDateString(locale, { timeZone: "UTC", dateStyle: "medium" }) : fmt(e.startsAt)}
                      {e.recurrenceRule ? " · repeats" : ""}
                    </li>
                  ))}
                  {file.result.events.length > preview.length && <li>…and {file.result.events.length - preview.length} more</li>}
                </ul>
              )}
              {file.result.skipped.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">Not imported as-is</p>
                  <ul className="list-disc pl-4">
                    {file.result.skipped.map((s) => <li key={s.reason}>{s.reason}: {s.count}</li>)}
                  </ul>
                </div>
              )}
              {file.result.events.length > 0 && (
                <Button onClick={importNow} disabled={pending} className="justify-self-start">
                  {pending ? "Adding…" : `Add ${file.result.events.length} event${file.result.events.length === 1 ? "" : "s"}`}
                </Button>
              )}
            </div>
          )}
        </section>

        <section aria-labelledby="ics-download" className="grid min-w-0 gap-2 border-t border-border pt-4">
          <h3 id="ics-download" className="text-sm font-medium">Download your calendar</h3>
          <p className="text-xs text-muted-foreground">Every event as one .ics file that any calendar app can open.</p>
          {demo ? (
            <p className="text-xs text-muted-foreground">Demo mode has no events of yours to download.</p>
          ) : (
            <Button asChild variant="outline" className="justify-self-start">
              <a href="/calendar/export" download><Download /> Download .ics</a>
            </Button>
          )}
        </section>

        <section aria-labelledby="ics-feed" className="grid min-w-0 gap-2 border-t border-border pt-4">
          <h3 id="ics-feed" className="text-sm font-medium">Show in another calendar app</h3>
          <p className="text-xs text-muted-foreground">
            A private link that Google Calendar, Apple Calendar or Outlook can subscribe to. It&apos;s read-only and updates when they refresh (Google can take up to a day). Anyone with the link can see your event titles, times, places and notes, so keep it to yourself.
          </p>
          {link ? (
            <div className="grid min-w-0 gap-2">
              <label htmlFor="feed-url" className="text-xs font-medium">Your private link (shown once)</label>
              <div className="flex min-w-0 gap-2">
                <Input id="feed-url" readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
                <Button variant="outline" onClick={async () => { await navigator.clipboard.writeText(link).catch(() => {}); setCopied(true); }}>
                  {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Google Calendar: Other calendars → + → From URL. Apple Calendar: File → New Calendar Subscription, or{" "}
                <a className="underline underline-offset-2" href={link.replace(/^https?:/, "webcal:")}>open it in your calendar app</a>. The calendar app needs to reach this site over the internet, so it works once Life OS is hosted, not on a local copy.
              </p>
            </div>
          ) : feed.exists ? (
            <p className="text-xs text-muted-foreground">
              A link is on{feed.createdAt ? `, created ${fmt(feed.createdAt)}` : ""}. {feed.lastUsedAt ? `A calendar app last read it ${fmt(feed.lastUsedAt)}.` : "No calendar app has read it yet."} For safety it can&apos;t be shown again; create a new one if you need it.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {!link && (
              <Button variant={feed.exists ? "outline" : "default"} disabled={pending} onClick={() => run(() => createCalendarFeed(), { onSuccess: (r) => { setLink(r.data?.url ?? null); setCopied(false); router.refresh(); } })}>
                {feed.exists ? <><RefreshCw /> Replace link</> : <><Link2 /> Create private link</>}
              </Button>
            )}
            {(feed.exists || link) && (
              <Button variant="ghost" disabled={pending} onClick={() => run(() => revokeCalendarFeed(), { onSuccess: () => { setLink(null); router.refresh(); } })}>
                <Link2Off /> Turn off link
              </Button>
            )}
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}
