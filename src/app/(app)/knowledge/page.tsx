import { ScreenHeader } from "@/components/shell/screen-header";
import { KnowledgeScreen } from "@/features/knowledge/knowledge-screen";
import { getKnowledgeWorkspace } from "@/server/knowledge";

export const metadata = { title: "Knowledge Base" };

export default async function KnowledgePage({ searchParams }: PageProps<"/knowledge">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : null;
  const ws = await getKnowledgeWorkspace(q, new Date());
  return (
    <div className="animate-rise">
      <ScreenHeader title="Knowledge" accent="base" accentTone="sage" phoneTitle="Knowledge" description="Notes, ideas, decisions and references, linked together." />
      <KnowledgeScreen key={`${ws.query ?? ""}:${sp.note ?? ""}`} ws={ws} openId={typeof sp.note === "string" ? sp.note : null} startNew={sp.new === "1"} />
    </div>
  );
}
