"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isDemoMode } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "./result";

const credentials = z.object({
  email: z.email("Enter a valid email address.").max(254),
  password: z.string().min(10, "Use at least 10 characters.").max(128),
});

function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function signIn(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  if (isDemoMode()) return { ok: false, error: "Sign-in is unavailable in demo mode." };
  const parsed = credentials.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { ok: false, error: "Check your email and password.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  // Supabase reports an unconfirmed email only once the password matched, so saying so reveals nothing new.
  if (error?.code === "email_not_confirmed") return { ok: false, error: "Confirm your email first: open the link we sent you (check spam too), then sign in." };
  // Same message for unknown email and wrong password (no account enumeration).
  if (error) return { ok: false, error: "That email and password combination didn't work." };
  redirect(safeNext(form.get("next")));
}

export async function signUp(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  if (isDemoMode()) return { ok: false, error: "Sign-up is unavailable in demo mode." };
  const parsed = credentials
    .extend({ displayName: z.string().trim().max(80).optional() })
    .safeParse({ email: form.get("email"), password: form.get("password"), displayName: form.get("displayName") || undefined });
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };

  const origin = (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { display_name: parsed.data.displayName ?? null }, emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) return { ok: false, error: error.message };
  if (data.session) redirect("/");
  return { ok: true, message: "Check your inbox to confirm your email, then sign in." };
}

export async function signOut() {
  if (!isDemoMode()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
