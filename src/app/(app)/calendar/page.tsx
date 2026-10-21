import { PageHeader } from "@/components/shell/page-header";
import { CalendarScreen } from "@/features/calendar/calendar-screen";
import type { CalendarView } from "@/lib/calendar";
import { getCalendarData } from "@/server/calendar";

export const metadata = { title: "Calendar" };

const VIEWS = new Set<CalendarView>(["day", "week", "month", "agenda"]);

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const sp = await searchParams;
  const view = typeof sp.view === "string" && VIEWS.has(sp.view as CalendarView) ? (sp.view as CalendarView) : "week";
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && !Number.isNaN(Date.parse(sp.date)) ? sp.date : null;
  const block = typeof sp.block === "string" ? sp.block : null;
  const now = new Date();
  const data = await getCalendarData(view, date, block, now);
  return (
    <div className="animate-rise">
      <PageHeader title="Calendar" description="Your time at a glance: events, time blocks and the tasks due each day." />
      <CalendarScreen data={data} nowIso={now.toISOString()} startNew={sp.new === "1"} />
    </div>
  );
}
