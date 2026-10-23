import Link from "next/link";
import { BellRing, Bot, CalendarCheck2, CalendarDays, CalendarSync, Clock, HeartPulse, Mail } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppleHealthImport } from "@/features/health/apple-health-import";
import { GoogleCalendarActions } from "@/features/integrations/google-calendar-actions";
import { getIntegrationStatus } from "@/server/integrations";

export const metadata = { title: "Integrations" };

type State = "on" | "ready" | "off" | "not_set_up" | "not_connected" | "attention";
const STATE: Record<State, { label: string; variant: "success" | "outline" | "default" | "warning" }> = {
  on: { label: "On", variant: "success" },
  ready: { label: "Set up", variant: "outline" },
  off: { label: "Off", variant: "default" },
  not_set_up: { label: "Not set up", variant: "warning" },
  not_connected: { label: "Not connected", variant: "default" },
  attention: { label: "Needs you", variant: "warning" },
};

// Shown once after coming back from Google's sign-in screen.
const GOOGLE_RETURN: Record<string, string> = {
  connected: "Google Calendar is connected. Your events are syncing.",
  denied: "Google Calendar wasn't connected: the request was cancelled on Google's screen.",
  no_access: "Google Calendar wasn't connected: tick the box that allows Life OS to see and edit your events, then try again.",
  expired: "That sign-in took too long or came from another browser. Please try connecting again.",
  failed: "Google Calendar couldn't be connected. Please try again in a minute.",
  not_set_up: "Google Calendar isn't set up on the server yet.",
};

function Item({ icon: Icon, title, state, children, action }: { icon: typeof BellRing; title: string; state: State; children: React.ReactNode; action?: React.ReactNode }) {
  const s = STATE[state];
  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-row items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <CardTitle className="flex flex-wrap items-center gap-2">{title} <Badge variant={s.variant}>{s.label}</Badge></CardTitle>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm text-muted-foreground">
        {children}
        {action && <div className="flex flex-wrap gap-2">{action}</div>}
      </CardContent>
    </Card>
  );
}

export default async function IntegrationsPage({ searchParams }: PageProps<"/integrations">) {
  const [s, sp] = await Promise.all([getIntegrationStatus(), searchParams]);
  const googleReturn = typeof sp.google === "string" ? GOOGLE_RETURN[sp.google] : undefined;
  const g = s.google;
  const googleState: State = !g.configured ? "not_set_up" : g.status === "connected" ? (g.lastError ? "attention" : "on") : g.status === "error" ? "attention" : "not_connected";
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(s.locale, { timeZone: s.timezone, dateStyle: "medium", timeStyle: "short" }) : null);
  return (
    <div className="animate-rise">
      <PageHeader title="Integrations" description="What Life OS connects to, what each connection can see, and whether it has been seen working." />
      {googleReturn && <p role="status" className="mb-4 rounded-2xl bg-accent px-4 py-3 text-sm text-accent-foreground">{googleReturn}</p>}
      {s.demo && <p className="mb-4 rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">Demo mode: nothing is connected and nothing is saved.</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Item icon={BellRing} title="Notifications on your devices" state={!s.push.configured ? "not_set_up" : s.push.devices ? "on" : "off"}
          action={<Button variant="outline" size="sm" asChild><Link href="/settings#notifications">Manage devices</Link></Button>}>
          <p>Reminders arrive on your phone or computer even when Life OS isn&apos;t open. Messages are encrypted for each device.</p>
          <p>
            {!s.push.configured ? "The server has no notification keys yet."
              : s.push.devices ? `On for ${s.push.devices} device${s.push.devices === 1 ? "" : "s"}. ${s.push.lastDelivered ? `Last delivered ${fmt(s.push.lastDelivered)}.` : "Nothing delivered yet."}`
              : "No device has notifications turned on."}
          </p>
        </Item>

        <Item icon={Clock} title="Reminder sender" state={s.sender.configured ? "ready" : "not_set_up"}>
          <p>Checks for due reminders every minute and sends them. It needs a scheduler in hosting to call it; see the deployment guide.</p>
          <p>{!s.sender.configured ? "Missing server settings (CRON_SECRET and SUPABASE_SECRET_KEY)." : s.sender.lastSent ? `Last sent one of your reminders ${fmt(s.sender.lastSent)}.` : "Settings are present, but it hasn't sent you anything yet."}</p>
        </Item>

        <Item icon={CalendarSync} title="Calendar subscribe link" state={s.feed.on ? "on" : "off"}
          action={<Button variant="outline" size="sm" asChild><Link href="/calendar">Open calendar</Link></Button>}>
          <p>A private, read-only link that Google Calendar, Apple Calendar or Outlook can subscribe to. Anyone with the link can see your events.</p>
          <p>{s.feed.on ? (s.feed.lastRead ? `Last read by a calendar app ${fmt(s.feed.lastRead)}.` : "Created; no calendar app has read it yet.") : "No link. Create one from Calendar → Import & export."}</p>
        </Item>

        <Item icon={CalendarDays} title="Calendar files (.ics)" state={s.calendarImported ? "on" : "off"}
          action={<Button variant="outline" size="sm" asChild><Link href="/calendar">Import or download</Link></Button>}>
          <p>Import events from another calendar&apos;s export, or download yours. A one-time copy: nothing stays connected.</p>
          <p>{s.calendarImported ? `${s.calendarImported} imported event${s.calendarImported === 1 ? "" : "s"} in your calendar.` : "Nothing imported yet."}</p>
        </Item>

        <Item icon={HeartPulse} title="Apple Health" state={s.appleHealth.lastImport ? "on" : "off"}
          action={<AppleHealthImport timeZone={s.timezone} demo={s.demo} triggerLabel="Import an export" />}>
          <p>Weight, body fat, resting heart rate, sleep and workouts from the Health app&apos;s export. The file is read on your device; there&apos;s no live connection (Apple only offers that to iPhone apps).</p>
          <p>{s.appleHealth.lastImport ? `Last import ${fmt(s.appleHealth.lastImport)}. ${s.appleHealth.deviceRows} device-recorded entries in Life OS.` : "Nothing imported yet."}</p>
        </Item>

        <Item icon={Bot} title="AI assistant (Anthropic)" state={s.ai.configured ? "ready" : "not_set_up"}
          action={<Button variant="outline" size="sm" asChild><Link href="/assistant">Open assistant</Link></Button>}>
          <p>Answers questions about your data and proposes changes for you to confirm. Usage is billed by Anthropic.</p>
          <p>{s.ai.configured ? "An API key is set on the server." : "No API key on the server yet."}</p>
        </Item>

        <Item icon={CalendarCheck2} title="Google Calendar (two-way)" state={googleState}
          action={g.configured && !s.demo ? <GoogleCalendarActions status={g.status} /> : undefined}>
          <p>Events from your main Google calendar appear here, and events you add or change in Life OS appear in Google. Life OS can see and edit your calendar events only, nothing else in your Google account.</p>
          <p>
            {!g.configured ? "Not set up on the server yet: it needs a Google Cloud project (see the deployment guide)."
              : g.status === "error" ? (g.lastError ?? "Google needs you to sign in again.")
              : g.status === "connected" ? `Connected${g.account ? ` to ${g.account}` : ""}. ${g.events} synced event${g.events === 1 ? "" : "s"}. ${g.lastSynced ? `Last synced ${fmt(g.lastSynced)}.` : "First sync hasn't finished yet."}${g.lastError ? ` ${g.lastError}` : ""}`
              : "Not connected. Syncs every couple of minutes once connected, and right away when you change an event here."}
          </p>
        </Item>

        <Item icon={Mail} title="Email reminders" state="not_connected">
          <p>Needs an account with an email sending service and your approval. Reminders set to email are recorded as skipped until then.</p>
        </Item>
      </div>
    </div>
  );
}
