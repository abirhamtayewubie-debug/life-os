import { toIcs } from "@/lib/ics";
import { audit, liveContext } from "@/server/actions/guard";
import { ICS_COLUMNS, toIcsEvents, type IcsRow } from "@/server/calendar-files";

/** Downloads your calendar as an .ics file, read through your session (RLS applies). */
export async function GET() {
  const ctx = await liveContext();
  if (!ctx) return new Response("Calendar download needs a connected database. Demo mode has no events of yours.", { status: 400 });
  const { data, error } = await ctx.supabase.from("calendar_events").select(ICS_COLUMNS).is("archived_at", null).order("starts_at").limit(10000);
  if (error) return new Response("Couldn't read your calendar. Please try again.", { status: 500 });
  await audit(ctx, "calendar.export_ics", undefined, { events: data.length });
  const day = new Date().toISOString().slice(0, 10);
  return new Response(toIcs(toIcsEvents(data as IcsRow[]), { name: "Life OS" }), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="life-os-calendar-${day}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
