/**
 * Supabase configuration. Only the project URL and the publishable (anon) key
 * are public: Row Level Security is what protects the data. The secret /
 * service-role key is never read here.
 */
export function supabaseEnv(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url, key };
}

/** Demo mode: no Supabase configured, so the app shows labelled sample data. */
export function isDemoMode(): boolean {
  return supabaseEnv() === null;
}
