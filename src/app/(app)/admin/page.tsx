import { PageHeader } from "@/components/shell/page-header";
import { AdminScreen } from "@/features/admin/admin-screen";
import { getAdminWorkspace } from "@/server/admin";

export const metadata = { title: "Home & Admin" };

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const sp = await searchParams;
  const ws = await getAdminWorkspace(new Date());
  return (
    <div className="animate-rise">
      <PageHeader title="Home & Admin" description="Renewals, important documents, home records and household routines." />
      <AdminScreen ws={ws} startNew={sp.new === "1"} />
    </div>
  );
}
