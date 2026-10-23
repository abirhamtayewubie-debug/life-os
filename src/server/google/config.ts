import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Google Calendar settings. The client id and secret come from the Google
 * Cloud project (docs/DEPLOYMENT.md). The base URLs can be pointed at a local
 * stand-in for tests.
 */
export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret || !process.env.SUPABASE_SECRET_KEY) return null;
  return {
    clientId,
    clientSecret,
    authUrl: process.env.GOOGLE_AUTH_URL ?? "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: process.env.GOOGLE_TOKEN_URL ?? "https://oauth2.googleapis.com/token",
    revokeUrl: process.env.GOOGLE_REVOKE_URL ?? "https://oauth2.googleapis.com/revoke",
    apiUrl: process.env.GOOGLE_CALENDAR_API ?? "https://www.googleapis.com/calendar/v3",
  };
}

export const googleConfigured = () => googleConfig() !== null;

/** Only what sync needs: read and change events. No access to other Google data. */
export const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.events";

/** Holds the sign-in request's state and PKCE verifier for ten minutes. */
export const OAUTH_COOKIE = "lifeos_google_oauth";

// Tokens are encrypted with a key derived from the server's secret key, so a
// copy of the database alone can't use them. Changing that secret means
// reconnecting Google, which is fine.
function key() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("SUPABASE_SECRET_KEY is not set");
  return Buffer.from(hkdfSync("sha256", secret, "life-os", "google-calendar-tokens", 32));
}

/** AES-256-GCM, stored as a Postgres bytea literal: iv · tag · ciphertext. */
export function sealToken(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `\\x${Buffer.concat([iv, c.getAuthTag(), body]).toString("hex")}`;
}

export function openToken(stored: string): string {
  const raw = Buffer.from(stored.replace(/^\\x/, ""), "hex");
  const d = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
}
