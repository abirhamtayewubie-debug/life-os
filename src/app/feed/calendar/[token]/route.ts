import { toIcs } from "@/lib/ics";
import { createSupabaseAnonClient } from "@/lib/supabase/server";
import { toIcsEvents, type IcsRow } from "@/server/calendar-files";

/**
 * Private subscribe link for calendar apps (Google, Apple, Outlook). Calendar
 * apps can't sign in, so the secret token in the link is the credential; the
 * database only returns events for the one person whose token matches.
 */
export async function GET(_req: Request, { params }: RouteContext<"/feed/calendar/[token]">) {
  const token = (await params).token.replace(/\.ics$/, "");
  const notFound = () => new Response("This calendar link doesn't exist or was turned off.", { status: 404, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return notFound();
  const db = createSupabaseAnonClient();
  if (!db) return notFound();

  const { data: live, error: liveErr } = await db.rpc("touch_calendar_feed", { feed_token: token });
  if (liveErr) return new Response("The calendar couldn't be read right now.", { status: 503, headers: { "Retry-After": "300" } });
  if (!live) return notFound();
  const { data, error } = await db.rpc("calendar_feed", { feed_token: token });
  if (error) return new Response("The calendar couldn't be read right now.", { status: 503, headers: { "Retry-After": "300" } });

  return new Response(toIcs(toIcsEvents((data ?? []) as IcsRow[]), { name: "Life OS" }), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="life-os.ics"',
      "Cache-Control": "private, max-age=300",
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer",
    },
  });
}
