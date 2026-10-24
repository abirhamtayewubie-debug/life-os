import { AreasScreen } from "@/features/areas/areas-screen";
import { getHiddenModules } from "@/server/modules";

export const metadata = { title: "Life areas" };

export default async function AreasPage() {
  const hidden = await getHiddenModules();
  return <AreasScreen hidden={hidden} />;
}
