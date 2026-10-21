import { PageHeader } from "@/components/shell/page-header";
import { WheelScreen } from "@/features/wheel/wheel-screen";
import { getWheelWorkspace } from "@/server/wheel";

export const metadata = { title: "Wheel of Life" };

export default async function WheelPage({ searchParams }: PageProps<"/wheel">) {
  const sp = await searchParams;
  const ws = await getWheelWorkspace(new Date());
  return (
    <div className="animate-rise">
      <PageHeader title="Wheel of Life" description="A periodic self-check across the areas of your life: where things are, and where you'd like them to be." />
      <WheelScreen ws={ws} startNew={sp.new === "1"} />
    </div>
  );
}
