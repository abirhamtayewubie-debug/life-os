import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

/** A Supabase client acting as the signed-in user (RLS applies). */
export async function createSupabaseServerClient() {
  const env = supabaseEnv();
  if (!env) throw new Error("Supabase is not configured");
  const cookieStore = await cookies();
  return createServerClient(env.url, env.key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are read-only there.
          // proxy.ts refreshes the session cookie on every request instead.
        }
      },
    },
  });
}

/** A client with no session at all, for public endpoints that call narrow, token-checked functions. */
export function createSupabaseAnonClient() {
  const env = supabaseEnv();
  if (!env) return null;
  return createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } });
}
