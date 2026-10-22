import { PageHeader } from "@/components/shell/page-header";
import { CalendarFiles, type FeedStatus } from "@/features/calendar/calendar-files";
import { CalendarScreen } from "@/features/calendar/calendar-screen";
import type { CalendarView } from "@/lib/calendar";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCalendarData } from "@/server/calendar";

export const metadata = { title: "Calendar" };

const VIEWS = new Set<CalendarView>(["day", "week", "month", "agenda"]);

async function feedStatus(demo: boolean): Promise<FeedStatus> {
  if (demo) return { exists: false, createdAt: null, lastUsedAt: null };
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("calendar_feeds").select("created_at, last_used_at").maybeSingle();
  return { exists: !!data, createdAt: data?.created_at ?? null, lastUsedAt: data?.last_used_at ?? null };
}

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const sp = await searchParams;
  const view = typeof sp.view === "string" && VIEWS.has(sp.view as CalendarView) ? (sp.view as CalendarView) : "week";
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && !Number.isNaN(Date.parse(sp.date)) ? sp.date : null;
  const block = typeof sp.block === "string" ? sp.block : null;
  const now = new Date();
  const data = await getCalendarData(view, date, block, now);
  const feed = await feedStatus(data.demo);
  return (
    <div className="animate-rise">
      <PageHeader
        title="Calendar"
        description="Your time at a glance: events, time blocks and the tasks due each day."
        actions={<CalendarFiles timezone={data.timezone} locale={data.locale} feed={feed} demo={data.demo} />}
      />
      <CalendarScreen data={data} nowIso={now.toISOString()} startNew={sp.new === "1"} />
    </div>
  );
}
