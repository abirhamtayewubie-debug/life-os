import { PageHeader } from "@/components/shell/page-header";
import { TasksScreen } from "@/features/tasks/tasks-screen";
import { parseFilters } from "@/features/tasks/filters";
import { getTaskWorkspace } from "@/server/tasks";

export const metadata = { title: "Tasks & Reminders" };

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const sp = await searchParams;
  const now = new Date();
  const ws = await getTaskWorkspace(now);
  const open = typeof sp.open === "string" ? sp.open : undefined;
  return (
    <div className="animate-rise">
      <PageHeader title="Tasks & Reminders" description="Plan the work, decide what matters today, and let reminders carry the rest." />
      <TasksScreen ws={ws} filters={parseFilters(sp)} nowIso={now.toISOString()} openId={open} />
    </div>
  );
}
