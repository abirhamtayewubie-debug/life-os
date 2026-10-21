import { PageHeader } from "@/components/shell/page-header";
import { RelationshipsScreen } from "@/features/relationships/relationships-screen";
import { getRelationshipsWorkspace } from "@/server/relationships";

export const metadata = { title: "Relationships" };

export default async function RelationshipsPage({ searchParams }: PageProps<"/relationships">) {
  const sp = await searchParams;
  const ws = await getRelationshipsWorkspace(new Date());
  return (
    <div className="animate-rise">
      <PageHeader title="Relationships" description="The people who matter, the dates to remember, and a gentle nudge to stay in touch." />
      <RelationshipsScreen ws={ws} startNew={sp.new === "1"} />
    </div>
  );
}
