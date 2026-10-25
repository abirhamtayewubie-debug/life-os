import { ScreenHeader } from "@/components/shell/screen-header";
import { ReportsScreen } from "@/features/reports/reports-screen";
import { getReport } from "@/server/reports";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const r = await getReport(await searchParams);
  return (
    <div className="animate-rise">
      <ScreenHeader title="Your" accent="reports" phoneTitle="Reports" description="What you logged in a day, week, month, quarter or year, compared with the one before. Counts only; no guesses." />
      <ReportsScreen r={r} />
    </div>
  );
}
