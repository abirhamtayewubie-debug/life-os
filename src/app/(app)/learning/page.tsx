import { PageHeader } from "@/components/shell/page-header";
import { LearningScreen } from "@/features/learning/learning-screen";
import { getLearningWorkspace } from "@/server/learning";

export const metadata = { title: "Learning" };

export default async function LearningPage({ searchParams }: PageProps<"/learning">) {
  const sp = await searchParams;
  const ws = await getLearningWorkspace(new Date());
  return (
    <div className="animate-rise">
      <PageHeader title="Learning" description="Books, courses and practice, and the skills you're building." />
      <LearningScreen ws={ws} startNew={sp.new === "1"} />
    </div>
  );
}
