import { ScreenHeader } from "@/components/shell/screen-header";
import { WorkScreen, type WorkTab } from "@/features/work/work-screen";
import { getWorkWorkspace } from "@/server/work";

export const metadata = { title: "Work & Projects" };

const TABS = new Set<WorkTab>(["projects", "board", "list", "calendar", "timeline", "time"]);

export default async function WorkPage({ searchParams }: PageProps<"/work">) {
  const sp = await searchParams;
  const now = new Date();
  const ws = await getWorkWorkspace(now);
  const tab = typeof sp.tab === "string" && TABS.has(sp.tab as WorkTab) ? (sp.tab as WorkTab) : "projects";
  const project = typeof sp.project === "string" ? sp.project : null;
  const task = typeof sp.task === "string" ? sp.task : null;
  return (
    <div className="animate-rise">
      <ScreenHeader title="Work &" accent="projects" phoneTitle="Work" description="Every project in one place: a board for the work, a list and a calendar for the deadlines, milestones, a timeline and the time it really takes." />
      <WorkScreen key={task ?? "work"} ws={ws} tab={tab} projectId={project} taskId={task} nowIso={now.toISOString()} startNew={sp.new === "1"} />
    </div>
  );
}
