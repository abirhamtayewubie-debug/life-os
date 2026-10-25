import { cookies } from "next/headers";
import { Sidebar, SIDEBAR_COOKIE } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { DemoBanner } from "@/components/shell/demo-banner";
import { MobileTabBar } from "@/components/shell/mobile-nav";
import { QuickAdd } from "@/components/shell/quick-add";
import { getViewer } from "@/server/viewer";
import { getHiddenModules } from "@/server/modules";
import { getNavCounts } from "@/server/areas";
import { ReminderNotifier } from "@/features/reminders/reminder-notifier";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const [viewer, hidden, cookieStore, counts] = await Promise.all([getViewer(), getHiddenModules(), cookies(), getNavCounts()]);
  const collapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === "collapsed";
  const demo = viewer.mode === "demo";

  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-xl focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">
        Skip to content
      </a>
      <Sidebar hidden={hidden} initialCollapsed={collapsed} account={{ name: viewer.profile.displayName, email: viewer.email, demo }} counts={counts} />
      <div className="flex min-w-0 flex-1 flex-col">
        {demo && <DemoBanner />}
        <TopBar hidden={hidden} name={viewer.profile.displayName} email={viewer.email} demo={demo} />
        <main id="main" className="mx-auto w-full max-w-[1200px] flex-1 px-5 pt-1 pb-32 md:px-6 md:pb-16 lg:px-10">
          {children}
        </main>
        <MobileTabBar hidden={hidden} />
        <QuickAdd hidden={hidden} />
      </div>
      {!demo && <ReminderNotifier />}
    </div>
  );
}
