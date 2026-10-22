import { Check, Lock, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shell/page-header";
import { AiSettingsForm } from "@/features/settings/ai-settings-form";
import { AppearancePicker } from "@/features/settings/appearance";
import { ModuleToggles } from "@/features/settings/module-toggles";
import { PreferencesForm } from "@/features/settings/preferences-form";
import { DataExport, DeleteAccount } from "@/features/settings/data-export";
import { NotificationSettings, type DeviceRow } from "@/features/settings/notification-settings";
import { SampleDataControls } from "@/features/settings/sample-data-controls";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DEFAULT_AI_SETTINGS, MODELS, type AiSettings } from "@/features/assistant/models";
import { loadAiSettings, monthSpend } from "@/server/ai/account";
import { aiConfigured } from "@/server/ai/client";
import { getHiddenModules } from "@/server/modules";
import { pushConfigured } from "@/server/notify/push";
import { getViewer } from "@/server/viewer";

export const metadata = { title: "Settings" };

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card id={id} className="min-w-0 scroll-mt-20">
      <CardHeader className="pb-4">
        <div>
          <CardTitle className="text-sm">{title}</CardTitle>
          {description && <CardDescription className="mt-1">{description}</CardDescription>}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Fact({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5 text-[13px]">
      {ok ? <Check className="mt-0.5 size-4 shrink-0 text-success" aria-label="Yes" /> : <X className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Not yet" />}
      <span>{children}</span>
    </li>
  );
}

export default async function SettingsPage() {
  const viewer = await getViewer();
  const hidden = await getHiddenModules();
  let hasSample = false;
  let weekStartsOn = 1;
  let ai: AiSettings = DEFAULT_AI_SETTINGS;
  let spendUsd: number | null = null;
  let devices: DeviceRow[] = [];
  if (viewer.mode === "live") {
    const supabase = await createSupabaseServerClient();
    const [{ count }, { data: p }, settings, spend, { data: subs }] = await Promise.all([
      supabase.from("tasks").select("id", { count: "exact", head: true }).eq("source", "sample"),
      supabase.from("profiles").select("week_starts_on").eq("id", viewer.userId).maybeSingle(),
      loadAiSettings(supabase),
      monthSpend(supabase, viewer.profile.timezone, new Date()),
      supabase.from("push_subscriptions").select("id, label, created_at, last_success_at, endpoint").order("created_at"),
    ]);
    devices = (subs ?? []).map((d) => ({ id: d.id, label: d.label, createdAt: d.created_at, lastSuccessAt: d.last_success_at, endpoint: d.endpoint }));
    hasSample = (count ?? 0) > 0;
    weekStartsOn = p?.week_starts_on ?? 1;
    ai = settings;
    spendUsd = spend.usd;
  }
  const configured = aiConfigured();
  const demo = viewer.mode === "demo";

  return (
    <div className="mx-auto max-w-3xl animate-rise">
      <PageHeader title="Settings" description="Preferences, navigation, privacy and your data." />
      <div className="grid gap-4">
        <Section id="profile" title="Profile & preferences" description="Your time zone decides what “today” means across every module.">
          {demo ? <p className="text-sm text-muted-foreground">Demo mode uses {viewer.profile.timezone} and {viewer.profile.baseCurrency}. Connect Supabase to save your own preferences.</p>
            : <PreferencesForm profile={viewer.profile} weekStartsOn={weekStartsOn} />}
        </Section>
        <Section id="appearance" title="Appearance">
          <AppearancePicker />
        </Section>
        <Section id="modules" title="Modules" description="Hide modules you don't use. Their data is kept, and you can bring them back any time.">
          {demo ? <p className="text-sm text-muted-foreground">Module visibility is saved to your account once a database is connected.</p> : <ModuleToggles hidden={hidden} />}
        </Section>
        <Section id="notifications" title="Notifications" description="Reminders can reach your phone or computer even when Life OS isn't open.">
          {demo ? <p className="text-sm text-muted-foreground">Device notifications need a connected database. In demo mode reminders only appear inside the app.</p>
            : <NotificationSettings devices={devices} configured={pushConfigured()} publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} locale={viewer.profile.locale} />}
        </Section>
        <Section id="assistant" title="AI assistant" description="Off until you switch it on. You choose the model, what it may read and how much it may spend.">
          {demo ? <p className="text-sm text-muted-foreground">The assistant needs a connected database and an Anthropic API key. Nothing is sent anywhere in demo mode.</p>
            : <AiSettingsForm settings={ai} configured={configured} spendUsd={spendUsd} />}
        </Section>
        <Section id="data" title="Your data" description="Download a copy any time. Sample data is always labelled and can be removed in one step.">
          <div className="grid gap-6">
            <SampleDataControls hasSample={hasSample} demo={demo} />
            {demo ? <p className="text-sm text-muted-foreground">Export and account deletion work once a database is connected; demo mode stores nothing of yours.</p>
              : <><DataExport /><DeleteAccount /></>}
          </div>
        </Section>
        <Section id="privacy" title="Privacy & security" description="What is true about your data right now.">
          <ul className="grid gap-2.5">
            <Fact ok={!demo}>Every record is isolated to your account by database row-level security, not just app code.</Fact>
            <Fact ok>No API keys or service credentials are ever sent to your browser.</Fact>
            <Fact ok>Journal entries are private by default. <Lock className="inline size-3" aria-hidden /></Fact>
            {ai.enabled && configured
              ? <Fact ok>The assistant ({MODELS[ai.model].label}) is on. It reads only the areas you shared, only when you ask, and every change it suggests waits for your confirmation.</Fact>
              : <Fact ok>The assistant is off. Nothing is sent to an AI provider.</Fact>}
            <Fact ok>Sensitive actions are written to an audit log you can&apos;t accidentally edit.</Fact>
            <Fact ok={devices.length > 0}>{devices.length ? `Reminders can notify ${devices.length} device${devices.length === 1 ? "" : "s"}.` : "No device gets notifications yet; reminders appear only inside the app."}</Fact>
            <Fact ok={!demo}>You can download all your data, or delete your account and everything in it, from this page.</Fact>
            <Fact ok={false}>No external services are connected (phase 7, each with explicit consent).</Fact>
          </ul>
          {!demo && <p className="mt-4 text-xs text-muted-foreground">Signed in as {viewer.email}.</p>}
        </Section>
      </div>
    </div>
  );
}
