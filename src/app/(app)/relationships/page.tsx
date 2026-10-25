import { ScreenHeader } from "@/components/shell/screen-header";
import { RelationshipsScreen } from "@/features/relationships/relationships-screen";
import { getRelationshipsWorkspace } from "@/server/relationships";

export const metadata = { title: "Relationships" };

export default async function RelationshipsPage({ searchParams }: PageProps<"/relationships">) {
  const sp = await searchParams;
  const ws = await getRelationshipsWorkspace(new Date());
  return (
    <div className="animate-rise">
      <ScreenHeader title="Your" accent="people" phoneTitle="People" description="The people who matter, the dates to remember, and a gentle nudge to stay in touch." />
      <RelationshipsScreen ws={ws} startNew={sp.new === "1"} />
    </div>
  );
}
