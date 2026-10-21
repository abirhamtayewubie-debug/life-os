import { PageHeader } from "@/components/shell/page-header";
import { ReflectionScreen } from "@/features/reflection/reflection-screen";
import { getReflectionWorkspace } from "@/server/reflection";

export const metadata = { title: "Reflection" };

export default async function ReflectionPage({ searchParams }: PageProps<"/reflection">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : null;
  const ws = await getReflectionWorkspace(q, new Date());
  return (
    <div className="animate-rise">
      <PageHeader title="Reflection" description="Your private journal, gratitude and prayer notes, and the values you want to live by." />
      <ReflectionScreen key={ws.query ?? ""} ws={ws} startNew={sp.new === "1"} />
    </div>
  );
}
