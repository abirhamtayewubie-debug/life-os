import Link from "next/link";
import { BellRing, Bot, CalendarDays, CalendarSync, Clock, HeartPulse, Mail } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppleHealthImport } from "@/features/health/apple-health-import";
import { getIntegrationStatus } from "@/server/integrations";

export const metadata = { title: "Integrations" };

type State = "on" | "ready" | "off" | "not_set_up" | "not_connected";
const STATE: Record<State, { label: string; variant: "success" | "outline" | "default" | "warning" }> = {
  on: { label: "On", variant: "success" },
  ready: { label: "Set up", variant: "outline" },
  off: { label: "Off", variant: "default" },
  not_set_up: { label: "Not set up", variant: "warning" },
  not_connected: { label: "Not connected", variant: "default" },
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

export default async function IntegrationsPage() {
  const s = await getIntegrationStatus();
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(s.locale, { timeZone: s.timezone, dateStyle: "medium", timeStyle: "short" }) : null);
  return (
    <div className="animate-rise">
      <PageHeader title="Integrations" description="What Life OS connects to, what each connection can see, and whether it has been seen working." />
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

        <Item icon={CalendarDays} title="Google Calendar (two-way)" state="not_connected">
          <p>Keeping Life OS and Google Calendar in step both ways needs a Google Cloud project and your approval. Until then, use the subscribe link (one-way) or calendar files.</p>
        </Item>

        <Item icon={Mail} title="Email reminders" state="not_connected">
          <p>Needs an email sending service, which is a paid account and needs your approval. Reminders set to email are recorded as skipped until then.</p>
        </Item>
      </div>
    </div>
  );
}
