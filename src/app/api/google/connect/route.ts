import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { GOOGLE_SCOPE, OAUTH_COOKIE, googleConfig } from "@/server/google/config";
import { getViewer } from "@/server/viewer";

/**
 * "Connect Google Calendar": sends the signed-in person to Google's consent
 * screen. A random state and PKCE verifier ride along in a short-lived,
 * http-only cookie so the callback can check the answer is for this request.
 */
export async function GET(request: NextRequest) {
  const { origin } = request.nextUrl;
  const viewer = await getViewer();
  const cfg = googleConfig();
  if (viewer.mode === "demo" || !cfg) return NextResponse.redirect(`${origin}/integrations?google=not_set_up`);

  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const url = new URL(cfg.authUrl);
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: `${origin}/api/google/callback`,
    response_type: "code",
    scope: GOOGLE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    ...(viewer.email ? { login_hint: viewer.email } : {}),
  }).toString();

  const res = NextResponse.redirect(url);
  res.cookies.set(OAUTH_COOKIE, [state, verifier, viewer.userId].join("."), {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/api/google",
    maxAge: 600,
  });
  return res;
}
