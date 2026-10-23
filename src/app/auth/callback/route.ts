import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Exchanges the email-confirmation code for a session. This only works in the
 * browser that signed up (PKCE); /auth/confirm works anywhere and is what the
 * email template should point to (see docs/DEPLOYMENT.md).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  // Only same-site paths, so the link can't send anyone elsewhere.
  const next = searchParams.get("next");
  const target = next?.startsWith("/") && !next.startsWith("//") ? next : "/";
  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${target}`);
  }
  return NextResponse.redirect(`${origin}/login?error=${target === "/reset-password" ? "reset" : "confirmation"}`);
}
