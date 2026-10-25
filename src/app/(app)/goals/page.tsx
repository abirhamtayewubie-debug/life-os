import { ScreenHeader } from "@/components/shell/screen-header";
import { GoalsScreen } from "@/features/goals/goals-screen";
import { getGoalWorkspace } from "@/server/goals";

export const metadata = { title: "Goals & Vision" };

export default async function GoalsPage({ searchParams }: PageProps<"/goals">) {
  const sp = await searchParams;
  const ws = await getGoalWorkspace(new Date());
  return (
    <div className="animate-rise">
      <ScreenHeader title="Goals &" accent="vision" phoneTitle="Goals" description="From the life you want to what matters this quarter. Link projects, tasks and habits to see how they add up." />
      <GoalsScreen key={String(sp.open ?? "")} ws={ws} startNew={sp.new === "1"} initialOpen={typeof sp.open === "string" ? sp.open : null} />
    </div>
  );
}
