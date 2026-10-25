import { FlaskConical } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/data/empty-state";
import { formatLongDate, greetingFor, localHour } from "@/lib/dates";
import { getHiddenModules } from "@/server/modules";
import type { SkyPhase } from "@/features/dashboard/clay-today";
import { CommandCenter } from "@/features/dashboard/command-center";
import { getDashboard } from "@/server/dashboard";

export const metadata = { title: "Today" };

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const now = new Date();
  const passwordChanged = (await searchParams).password === "changed";
  const notice = passwordChanged && <p role="status" className="mb-4 rounded-xl border border-border bg-muted px-3 py-2 text-sm">Your password was changed.</p>;
  const [{ viewer, model, layout, hasAnyData, hasSampleData }, hidden] = await Promise.all([getDashboard(now), getHiddenModules()]);
  const tz = viewer.profile.timezone;
  const first = viewer.profile.displayName?.split(" ")[0];
  const greeting = `${greetingFor(now, tz)}${first ? `, ${first}` : ""}`;
  const longDate = formatLongDate(now, tz, viewer.profile.locale);

  if (viewer.mode === "live" && !hasAnyData) {
    return (
      <div className="animate-rise">
        {notice}
        <p className="text-xs font-semibold tracking-[0.1em] text-subtle-foreground uppercase">{longDate}</p>
        <h1 className="mt-2 font-display text-[34px] leading-[1.05] font-normal tracking-[-0.028em] sm:text-[44px]">{greeting}</h1>
        <div className="mt-8 rounded-3xl bg-card shadow-card">
          <EmptyState
            icon={FlaskConical}
            title="Your Command Center is empty, and that's honest"
            action={<Button asChild><Link href="/settings#data">Load sample data</Link></Button>}
          >
            Nothing here is invented. It fills in as you add tasks, habits, events and the rest from the menu. You can also load clearly
            labelled sample data to explore, and remove it in one click.
          </EmptyState>
        </div>
      </div>
    );
  }

  const hour = localHour(now, tz);
  const sky: SkyPhase = hour >= 5 && hour < 9 ? "dawn" : hour >= 9 && hour < 16 ? "day" : hour >= 16 && hour < 22 ? "evening" : "night";
  const part = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(viewer.profile.locale, { timeZone: tz, ...o }).format(now);
  const time = part({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const hero = {
    greeting: greetingFor(now, tz),
    name: first ?? null,
    shortLabel: `${part({ weekday: "short" })}, ${part({ day: "numeric" })} ${part({ month: "short" })} · ${time}`,
    longLabel: `${part({ weekday: "long" })} · ${part({ day: "numeric" })} ${part({ month: "long" })} ${part({ year: "numeric" })} · ${time}`,
    sky,
  };
  const dayLabel = `${part({ weekday: "short" })} ${part({ day: "numeric" })}`;

  return (
    <>
      {notice}
      {viewer.mode === "live" && hasSampleData && (
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-warning/50 bg-warning/8 px-3.5 py-2 text-xs">
          <FlaskConical className="size-3.5 text-warning" aria-hidden />
          <span>Some records on this page are sample data, marked <strong>Sample</strong>.</span>
          <Link href="/settings#data" className="ml-auto font-medium text-brand hover:underline">Remove sample data</Link>
        </div>
      )}
      <CommandCenter
        model={model} initialLayout={layout} demo={viewer.mode === "demo"} locale={viewer.profile.locale}
        hero={hero} nowLabel={time} dayLabel={dayLabel} assistant={!hidden.includes("assistant")} nowIso={now.toISOString()}
      />
    </>
  );
}
