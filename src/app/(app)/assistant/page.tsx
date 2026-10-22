import Link from "next/link";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { AssistantScreen } from "@/features/assistant/assistant-screen";
import { getAssistantWorkspace } from "@/server/assistant";

export const metadata = { title: "AI Assistant" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ws = await getAssistantWorkspace(await searchParams);
  return (
    <div className="animate-rise">
      <PageHeader
        title="AI Assistant"
        description="Ask about your own records. It reads only what you share, and nothing changes until you confirm."
        actions={<Button size="sm" variant="ghost" asChild><Link href="/settings#assistant"><Settings2 /> Assistant settings</Link></Button>}
      />
      <AssistantScreen ws={ws} />
    </div>
  );
}
