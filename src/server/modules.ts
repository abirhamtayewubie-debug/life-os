import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getViewer } from "./viewer";

/** Module keys the user chose to hide from navigation. */
export async function getHiddenModules(): Promise<string[]> {
  const viewer = await getViewer();
  if (viewer.mode === "demo") return [];
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("module_settings").select("module_key").eq("enabled", false);
  return (data ?? []).map((r) => r.module_key);
}
