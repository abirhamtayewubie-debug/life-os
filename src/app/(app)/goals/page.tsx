import { PageHeader } from "@/components/shell/page-header";
import { GoalsScreen } from "@/features/goals/goals-screen";
import { getGoalWorkspace } from "@/server/goals";

export const metadata = { title: "Goals & Vision" };

export default async function GoalsPage({ searchParams }: PageProps<"/goals">) {
  const sp = await searchParams;
  const ws = await getGoalWorkspace(new Date());
  return (
    <div className="animate-rise">
      <PageHeader title="Goals & Vision" description="From the life you want to what matters this quarter. Link projects, tasks and habits to see how they add up." />
      <GoalsScreen key={String(sp.open ?? "")} ws={ws} startNew={sp.new === "1"} initialOpen={typeof sp.open === "string" ? sp.open : null} />
    </div>
  );
}
