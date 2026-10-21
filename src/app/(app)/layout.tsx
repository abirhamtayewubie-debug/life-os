import { cookies } from "next/headers";
import { Sidebar, SIDEBAR_COOKIE } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { DemoBanner } from "@/components/shell/demo-banner";
import { getViewer } from "@/server/viewer";
import { getHiddenModules } from "@/server/modules";
import { ReminderNotifier } from "@/features/reminders/reminder-notifier";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const [viewer, hidden, cookieStore] = await Promise.all([getViewer(), getHiddenModules(), cookies()]);
  const collapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === "collapsed";
  const demo = viewer.mode === "demo";

  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">
        Skip to content
      </a>
      <Sidebar hidden={hidden} initialCollapsed={collapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        {demo && <DemoBanner />}
        <TopBar hidden={hidden} name={viewer.profile.displayName} email={viewer.email} demo={demo} />
        <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
      {!demo && <ReminderNotifier />}
    </div>
  );
}
