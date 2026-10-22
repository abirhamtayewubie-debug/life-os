"use server";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { DELETE_PHRASE } from "@/features/account/constants";
import { supabaseEnv } from "@/lib/supabase/env";
import { DEMO_RESULT, type ActionResult } from "./result";
import { liveContext } from "./guard";

const deleteSchema = z.object({
  password: z.string().min(1, "Enter your password.").max(128),
  phrase: z.string().trim().toLowerCase().refine((s) => s === DELETE_PHRASE, `Type “${DELETE_PHRASE}” to confirm.`),
});

/**
 * Deletes the signed-in person's account and every row they own. Needs the
 * password again (checked on a throwaway client, so the current session is
 * untouched if it's wrong) and the typed phrase. The database function only
 * ever deletes auth.uid(), so nothing here can target anyone else.
 */
export async function deleteAccount(input: z.input<typeof deleteSchema>): Promise<ActionResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the highlighted fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const ctx = await liveContext();
  const env = supabaseEnv();
  if (!ctx || !env) return DEMO_RESULT;
  if (!ctx.viewer.email) return { ok: false, error: "This account has no email to confirm with." };

  const check = createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data: signedIn, error: authError } = await check.auth.signInWithPassword({ email: ctx.viewer.email, password: parsed.data.password });
  if (authError || signedIn.user?.id !== ctx.viewer.userId) {
    return { ok: false, error: "That password didn't match. Nothing was deleted.", fieldErrors: { password: ["That password didn't match."] } };
  }

  const { error } = await ctx.supabase.rpc("delete_my_account");
  if (error) {
    console.error("delete_my_account failed", error);
    return { ok: false, error: "Your account couldn't be deleted. Nothing was removed; please try again." };
  }
  // The user no longer exists; this just clears the session cookies.
  await ctx.supabase.auth.signOut({ scope: "local" }).catch(() => {});
  return { ok: true, message: "Your account and everything in it were deleted." };
}
