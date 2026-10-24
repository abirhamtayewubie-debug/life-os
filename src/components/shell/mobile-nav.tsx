"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, LayoutGrid, ListChecks, Plus, Repeat, Sun, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { isActivePath } from "./nav-items";
import { openQuickAdd } from "./quick-add";

type Tab = { key: string; label: string; href: string; icon: LucideIcon };

/** Phone navigation: Today · Plan · + · Habits · Areas. Areas replaces the old side drawer. */
export function MobileTabBar({ hidden }: { hidden: string[] }) {
  const pathname = usePathname();
  const shown = (key: string) => !hidden.includes(key);

  const left: Tab[] = [
    { key: "home", label: "Today", href: "/", icon: Sun },
    shown("calendar") ? { key: "calendar", label: "Plan", href: "/calendar", icon: CalendarDays } : { key: "tasks", label: "Tasks", href: "/tasks", icon: ListChecks },
  ];
  const habits: Tab | null = shown("habits") ? { key: "habits", label: "Habits", href: "/habits", icon: Repeat } : null;
  const fixed = [...left, ...(habits ? [habits] : [])].map((t) => t.href);
  // Every page without its own tab lives under Areas.
  const areas: Tab = { key: "areas", label: "Areas", href: "/areas", icon: LayoutGrid };
  const areasActive = !fixed.some((h) => isActivePath(pathname, h));

  const renderTab = (t: Tab, active: boolean) => (
    <Link
      key={t.key}
      href={t.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-14 min-w-11 flex-1 flex-col items-center justify-center gap-1 text-[12px] text-subtle-foreground transition-colors",
        active && "text-foreground",
      )}
    >
      <t.icon className="size-[22px]" strokeWidth={1.6} aria-hidden />
      {t.label}
      <span className={cn("absolute bottom-0.5 size-1 rounded-full bg-clay", !active && "invisible")} aria-hidden />
    </Link>
  );

  return (
    <nav
      aria-label="Quick navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="mx-auto flex h-[76px] max-w-lg items-center gap-1 px-3">
        {left.map((t) => renderTab(t, isActivePath(pathname, t.href)))}
        <button
          type="button"
          onClick={openQuickAdd}
          aria-label="Add something new"
          aria-haspopup="dialog"
          className="mx-1 flex size-[52px] shrink-0 items-center justify-center rounded-[18px] bg-primary text-primary-foreground shadow-clay transition-transform active:scale-95"
        >
          <Plus className="size-6" strokeWidth={1.8} aria-hidden />
        </button>
        {habits && renderTab(habits, isActivePath(pathname, habits.href))}
        {renderTab(areas, areasActive)}
      </div>
    </nav>
  );
}
