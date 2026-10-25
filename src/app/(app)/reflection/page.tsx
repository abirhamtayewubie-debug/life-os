import { ScreenHeader } from "@/components/shell/screen-header";
import { ReflectionScreen, type ReflectionTab } from "@/features/reflection/reflection-screen";
import { getReflectionWorkspace } from "@/server/reflection";

export const metadata = { title: "Reflection" };

const TABS = new Set<string>(["journal", "meditation", "reading", "reviews"] satisfies ReflectionTab[]);

export default async function ReflectionPage({ searchParams }: PageProps<"/reflection">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : null;
  const ws = await getReflectionWorkspace(q, new Date());
  const tab = (typeof sp.tab === "string" && TABS.has(sp.tab) ? sp.tab : "journal") as ReflectionTab;
  return (
    <div className="animate-rise">
      <ScreenHeader title="Quiet" accent="reflection" phoneTitle="Reflection" description="Your private journal, meditation, reading, weekly and monthly reviews, and the values you want to live by." />
      <ReflectionScreen key={ws.query ?? ""} ws={ws} tab={tab} startNew={sp.new === "1"} />
    </div>
  );
}
