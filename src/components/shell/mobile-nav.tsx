"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BedDouble, BookHeart, CalendarDays, CalendarPlus, FilePlus, LayoutGrid, ListChecks, ListPlus, Plus, Repeat, Smile, Sun, Wallet, type LucideIcon } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { APP_EVENTS, useOpenNew } from "./command-palette";
import { Logo } from "./logo";
import { NavItems, isActivePath } from "./nav-items";

type Tab = { key: string; label: string; href: string; icon: LucideIcon };

const QUICK_ADD: { module: string; label: string; href: string; event: string; icon: LucideIcon }[] = [
  { module: "tasks", label: "Task", href: "/tasks", event: APP_EVENTS.newTask, icon: ListPlus },
  { module: "calendar", label: "Event", href: "/calendar", event: APP_EVENTS.newEvent, icon: CalendarPlus },
  { module: "habits", label: "Habit", href: "/habits", event: APP_EVENTS.newHabit, icon: Repeat },
  { module: "finance", label: "Expense", href: "/finance", event: APP_EVENTS.newTransaction, icon: Wallet },
  { module: "spirit", label: "Journal", href: "/reflection", event: APP_EVENTS.newJournal, icon: BookHeart },
  { module: "health", label: "Mood", href: "/health", event: APP_EVENTS.newCheckin, icon: Smile },
  { module: "sleep", label: "Sleep", href: "/sleep", event: APP_EVENTS.newSleep, icon: BedDouble },
  { module: "knowledge", label: "Note", href: "/knowledge", event: APP_EVENTS.newNote, icon: FilePlus },
];

/** Phone navigation: a floating tab bar with quick add in the middle and every module under More. */
export function MobileTabBar({ hidden }: { hidden: string[] }) {
  const pathname = usePathname();
  const openNew = useOpenNew();
  const [menu, setMenu] = useState(false);
  const [add, setAdd] = useState(false);

  const shown = (key: string) => !hidden.includes(key);
  const left: Tab[] = [
    { key: "home", label: "Today", href: "/", icon: Sun },
    shown("calendar") ? { key: "calendar", label: "Plan", href: "/calendar", icon: CalendarDays } : { key: "tasks", label: "Tasks", href: "/tasks", icon: ListChecks },
  ];
  const right: Tab[] = shown("habits") ? [{ key: "habits", label: "Habits", href: "/habits", icon: Repeat }] : [];
  const tabHrefs = [...left, ...right].map((t) => t.href);
  const moreActive = !tabHrefs.some((h) => isActivePath(pathname, h));

  const tab = "flex h-14 min-w-14 flex-1 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-medium text-muted-foreground transition-colors";
  const renderTab = (t: Tab) => {
    const active = isActivePath(pathname, t.href);
    return (
      <Link key={t.key} href={t.href} aria-current={active ? "page" : undefined} className={cn(tab, active && "font-semibold text-brand")}>
        <t.icon className="size-[22px]" strokeWidth={active ? 2.1 : 1.8} aria-hidden />
        {t.label}
      </Link>
    );
  };

  return (
    <>
      <nav
        aria-label="Quick navigation"
        className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+12px)] z-40 flex h-[68px] items-center gap-1 rounded-[26px] bg-popover/92 px-2 shadow-raised backdrop-blur-xl lg:hidden"
      >
        {left.map(renderTab)}
        <button
          type="button"
          onClick={() => setAdd(true)}
          aria-label="Add something new"
          aria-haspopup="dialog"
          className="mx-1 flex size-[52px] shrink-0 items-center justify-center rounded-[18px] bg-primary text-primary-foreground shadow-[0_8px_18px_-8px_rgb(17_19_24/0.7)] transition-transform active:scale-95"
        >
          <Plus className="size-6" strokeWidth={2.4} aria-hidden />
        </button>
        {right.map(renderTab)}
        <button type="button" onClick={() => setMenu(true)} aria-haspopup="dialog" className={cn(tab, moreActive && "font-semibold text-brand")}>
          <LayoutGrid className="size-[22px]" strokeWidth={moreActive ? 2.1 : 1.8} aria-hidden />
          More
        </button>
      </nav>

      <Sheet open={menu} onOpenChange={setMenu}>
        <SheetContent aria-describedby={undefined}>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-20 items-center px-5 pt-[env(safe-area-inset-top)]">
            <Logo />
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-8">
            <NavItems hidden={hidden} onNavigate={() => setMenu(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={add} onOpenChange={setAdd}>
        <SheetContent side="bottom" aria-describedby={undefined} className="bg-popover">
          <div className="mx-auto mt-3 h-1.5 w-10 rounded-full bg-input" aria-hidden />
          <SheetTitle className="px-6 pt-4 pb-3 font-display text-xl font-semibold tracking-[-0.02em]">Add something</SheetTitle>
          <div className="grid grid-cols-4 gap-2 px-4 pb-6">
            {QUICK_ADD.filter((q) => shown(q.module)).map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => { setAdd(false); openNew(q.href, q.event); }}
                className="flex flex-col items-center gap-2 rounded-2xl px-1 py-3 text-xs font-medium text-foreground transition-colors hover:bg-muted active:bg-muted"
              >
                <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                  <q.icon className="size-[22px]" strokeWidth={1.8} aria-hidden />
                </span>
                {q.label}
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
