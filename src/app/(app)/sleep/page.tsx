import { PageHeader } from "@/components/shell/page-header";
import { SleepScreen } from "@/features/health/sleep-screen";
import { getHealthWorkspace } from "@/server/health";

export const metadata = { title: "Sleep & Recovery" };

export default async function SleepPage({ searchParams }: PageProps<"/sleep">) {
  const sp = await searchParams;
  const ws = await getHealthWorkspace();
  return (
    <div className="animate-rise">
      <PageHeader title="Sleep & Recovery" description="When you slept, for how long, and how rested you felt." />
      <SleepScreen ws={ws} startNew={sp.new === "1"} />
    </div>
  );
}
