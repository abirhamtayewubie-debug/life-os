import { AreasScreen } from "@/features/areas/areas-screen";
import { getAreaStatus } from "@/server/areas";
import { getHiddenModules } from "@/server/modules";

export const metadata = { title: "Life areas" };

export default async function AreasPage() {
  const [hidden, status] = await Promise.all([getHiddenModules(), getAreaStatus()]);
  return <AreasScreen hidden={hidden} status={status} />;
}
