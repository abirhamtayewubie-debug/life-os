import { Check, Lock, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shell/page-header";
import { AppearancePicker } from "@/features/settings/appearance";
import { ModuleToggles } from "@/features/settings/module-toggles";
import { PreferencesForm } from "@/features/settings/preferences-form";
import { SampleDataControls } from "@/features/settings/sample-data-controls";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getHiddenModules } from "@/server/modules";
import { getViewer } from "@/server/viewer";

export const metadata = { title: "Settings" };

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-20">
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
  if (viewer.mode === "live") {
    const supabase = await createSupabaseServerClient();
    const [{ count }, { data: p }] = await Promise.all([
      supabase.from("tasks").select("id", { count: "exact", head: true }).eq("source", "sample"),
      supabase.from("profiles").select("week_starts_on").eq("id", viewer.userId).maybeSingle(),
    ]);
    hasSample = (count ?? 0) > 0;
    weekStartsOn = p?.week_starts_on ?? 1;
  }
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
        <Section id="data" title="Your data" description="Sample data is always labelled and can be removed in one step.">
          <SampleDataControls hasSample={hasSample} demo={demo} />
          <p className="mt-4 text-xs text-muted-foreground">Full export (JSON and CSV) and account deletion are planned for phase 8, with per-module CSV export arriving as each module ships.</p>
        </Section>
        <Section id="privacy" title="Privacy & security" description="What is true about your data right now.">
          <ul className="grid gap-2.5">
            <Fact ok={!demo}>Every record is isolated to your account by database row-level security, not just app code.</Fact>
            <Fact ok>No API keys or service credentials are ever sent to your browser.</Fact>
            <Fact ok>Journal entries are private by default. <Lock className="inline size-3" aria-hidden /></Fact>
            <Fact ok>AI features are off. Nothing is sent to an AI provider (arrives in phase 6, opt-in per module).</Fact>
            <Fact ok>Sensitive actions are written to an audit log you can&apos;t accidentally edit.</Fact>
            <Fact ok={false}>Push and email notifications are not set up yet (phase 7).</Fact>
            <Fact ok={false}>No external services are connected (phase 7, each with explicit consent).</Fact>
          </ul>
          {!demo && <p className="mt-4 text-xs text-muted-foreground">Signed in as {viewer.email}.</p>}
        </Section>
      </div>
    </div>
  );
}
