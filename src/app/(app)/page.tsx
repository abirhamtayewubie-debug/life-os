import { FlaskConical } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/data/empty-state";
import { formatLongDate, greetingFor } from "@/lib/dates";
import { CommandCenter } from "@/features/dashboard/command-center";
import { getDashboard } from "@/server/dashboard";

export const metadata = { title: "Command Center" };

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const now = new Date();
  const passwordChanged = (await searchParams).password === "changed";
  const notice = passwordChanged && <p role="status" className="mb-4 rounded-md border border-border bg-muted px-3 py-2 text-sm">Your password was changed.</p>;
  const { viewer, model, layout, hasAnyData, hasSampleData } = await getDashboard(now);
  const tz = viewer.profile.timezone;
  const first = viewer.profile.displayName?.split(" ")[0];
  const greeting = `${greetingFor(now, tz)}${first ? `, ${first}` : ""}`;
  const longDate = formatLongDate(now, tz, viewer.profile.locale);

  if (viewer.mode === "live" && !hasAnyData) {
    return (
      <div className="animate-rise">
        {notice}
        <p className="text-xs text-muted-foreground">{longDate}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{greeting}</h1>
        <div className="mt-8 rounded-xl border border-dashed border-border">
          <EmptyState
            icon={FlaskConical}
            title="Your Command Center is empty, and that's honest"
            action={<Button asChild><Link href="/settings#data">Load sample data</Link></Button>}
          >
            Nothing here is invented. Tasks, habits and the rest of the modules arrive from phase 2 onward. Until then you can load clearly
            labelled sample data to explore, and remove it in one click.
          </EmptyState>
        </div>
      </div>
    );
  }

  return (
    <>
      {notice}
      {viewer.mode === "live" && hasSampleData && (
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-warning/50 bg-warning/8 px-3.5 py-2 text-xs">
          <FlaskConical className="size-3.5 text-warning" aria-hidden />
          <span>Some records on this page are sample data, marked <strong>Sample</strong>.</span>
          <Link href="/settings#data" className="ml-auto font-medium text-brand hover:underline">Remove sample data</Link>
        </div>
      )}
      <CommandCenter model={model} initialLayout={layout} demo={viewer.mode === "demo"} locale={viewer.profile.locale} greeting={greeting} longDate={longDate} />
    </>
  );
}
