import { PageHeader } from "@/components/shell/page-header";
import { LearningScreen, type LearningTab } from "@/features/learning/learning-screen";
import { getLearningWorkspace } from "@/server/learning";

export const metadata = { title: "Learning" };

const TABS = new Set<string>(["library", "roadmaps", "sessions"] satisfies LearningTab[]);

export default async function LearningPage({ searchParams }: PageProps<"/learning">) {
  const sp = await searchParams;
  const ws = await getLearningWorkspace(new Date());
  const tab = (typeof sp.tab === "string" && TABS.has(sp.tab) ? sp.tab : "library") as LearningTab;
  return (
    <div className="animate-rise">
      <PageHeader title="Learning" description="Roadmaps, study plans, books and courses, and the skills you're building." />
      <LearningScreen ws={ws} tab={tab} startNew={sp.new === "1"} />
    </div>
  );
}
