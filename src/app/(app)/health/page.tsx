import { PageHeader } from "@/components/shell/page-header";
import { AppleHealthImport } from "@/features/health/apple-health-import";
import { HealthScreen, type HealthTab } from "@/features/health/health-screen";
import { getHealthWorkspace } from "@/server/health";

export const metadata = { title: "Health & Fitness" };

const TABS = new Set<string>(["today", "workouts", "programs", "progress", "sleep", "body", "trends"] satisfies HealthTab[]);

export default async function HealthPage({ searchParams }: PageProps<"/health">) {
  const sp = await searchParams;
  const ws = await getHealthWorkspace();
  const tab = (typeof sp.tab === "string" && TABS.has(sp.tab) ? sp.tab : "today") as HealthTab;
  return (
    <div className="animate-rise">
      <PageHeader
        title="Health & Fitness"
        description="Check-ins, water, workouts, sleep and body measurements, exactly as you logged them."
        actions={<AppleHealthImport timeZone={ws.timezone} demo={ws.demo} />}
      />
      <HealthScreen ws={ws} tab={tab} startNew={sp.new === "1"} />
    </div>
  );
}
