import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/server/notify/admin";
import { OAUTH_COOKIE } from "@/server/google/config";
import { GoogleScopeError, connectWithCode, syncUser } from "@/server/google/sync";
import { getViewer } from "@/server/viewer";

/** Google sends the person back here after the consent screen. */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const back = (result: string) => {
    const res = NextResponse.redirect(`${origin}/integrations?google=${result}`);
    res.cookies.set(OAUTH_COOKIE, "", { path: "/api/google", maxAge: 0 });
    return res;
  };

  const [state, verifier, userId] = (request.cookies.get(OAUTH_COOKIE)?.value ?? "").split(".");
  const given = searchParams.get("state") ?? "";
  if (!state || !verifier || !userId || !same(given, state)) return back("expired");
  if (searchParams.get("error")) return back("denied");
  const code = searchParams.get("code");
  if (!code) return back("expired");

  const viewer = await getViewer();
  if (viewer.mode === "demo" || viewer.userId !== userId) return back("expired");
  const db = adminClient();
  if (!db) return back("not_set_up");

  try {
    await connectWithCode(db, viewer.userId, code, `${origin}/api/google/callback`, verifier);
  } catch (e) {
    if (e instanceof GoogleScopeError) return back("no_access");
    console.error("google connect failed", e instanceof Error ? e.message : e);
    return back("failed");
  }
  try {
    await syncUser(db, viewer.userId);
  } catch {
    // Connected; the problem is shown on the Integrations page and retried.
  }
  return back("connected");
}

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
