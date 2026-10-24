import { redirect } from "next/navigation";

/** Sleep & Recovery now lives inside Health & Fitness; old links and bookmarks land on its tab. */
export default async function SleepPage({ searchParams }: PageProps<"/sleep">) {
  const sp = await searchParams;
  redirect(`/health?tab=sleep${sp.new === "1" ? "&new=1" : ""}`);
}
