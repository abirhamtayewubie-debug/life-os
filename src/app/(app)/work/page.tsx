import { PageHeader } from "@/components/shell/page-header";
import { WorkScreen } from "@/features/work/work-screen";
import { getWorkWorkspace } from "@/server/work";

export const metadata = { title: "Work & Projects" };

const TABS = new Set(["projects", "board", "timeline", "time"]);

export default async function WorkPage({ searchParams }: PageProps<"/work">) {
  const sp = await searchParams;
  const now = new Date();
  const ws = await getWorkWorkspace(now);
  const tab = typeof sp.tab === "string" && TABS.has(sp.tab) ? (sp.tab as "projects") : "projects";
  const project = typeof sp.project === "string" ? sp.project : null;
  return (
    <div className="animate-rise">
      <PageHeader title="Work & Projects" description="Projects with milestones, a board for the work, a timeline for the dates, and the time it really takes." />
      <WorkScreen ws={ws} tab={tab} projectId={project} nowIso={now.toISOString()} startNew={sp.new === "1"} />
    </div>
  );
}
