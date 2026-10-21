import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { isDemoMode } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ViewerProfile } from "@/features/dashboard/types";

export type Viewer =
  | { mode: "demo"; userId: null; email: null; profile: ViewerProfile }
  | { mode: "live"; userId: string; email: string | null; profile: ViewerProfile };

export const DEMO_PROFILE: ViewerProfile = {
  displayName: null,
  timezone: process.env.DEMO_TIMEZONE ?? "Africa/Addis_Ababa",
  locale: "en-US",
  baseCurrency: "ETB",
};

/**
 * Data Access Layer entry point: who is asking. Every server read and action
 * starts here. Redirects to /login when there is no valid session.
 */
export const getViewer = cache(async (): Promise<Viewer> => {
  if (isDemoMode()) return { mode: "demo", userId: null, email: null, profile: DEMO_PROFILE };

  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: p } = await supabase
    .from("profiles")
    .select("display_name, timezone, locale, base_currency")
    .eq("id", auth.user.id)
    .maybeSingle();

  return {
    mode: "live",
    userId: auth.user.id,
    email: auth.user.email ?? null,
    profile: {
      displayName: p?.display_name ?? null,
      timezone: p?.timezone ?? "UTC",
      locale: p?.locale ?? "en-US",
      baseCurrency: p?.base_currency ?? "USD",
    },
  };
});
