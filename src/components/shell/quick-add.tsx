"use client";

import { useEffect, useState } from "react";
import { BedDouble, BookHeart, CalendarPlus, FilePlus, ListPlus, Repeat, Smile, Wallet, type LucideIcon } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { APP_EVENTS, useOpenNew } from "./command-palette";

const QUICK_ADD_EVENT = "lifeos:quick-add";

/** Open the quick-add sheet from anywhere: the phone + button or the sidebar's + New. */
export function openQuickAdd() {
  window.dispatchEvent(new Event(QUICK_ADD_EVENT));
}

const QUICK_ADD: { module: string; label: string; href: string; event: string; icon: LucideIcon; tint: string }[] = [
  { module: "tasks", label: "Task", href: "/tasks", event: APP_EVENTS.newTask, icon: ListPlus, tint: "bg-tint-clay" },
  { module: "calendar", label: "Event", href: "/calendar", event: APP_EVENTS.newEvent, icon: CalendarPlus, tint: "bg-tint-sand" },
  { module: "habits", label: "Habit", href: "/habits", event: APP_EVENTS.newHabit, icon: Repeat, tint: "bg-tint-sage" },
  { module: "knowledge", label: "Note", href: "/knowledge", event: APP_EVENTS.newNote, icon: FilePlus, tint: "bg-tint-mist" },
  { module: "finance", label: "Expense", href: "/finance", event: APP_EVENTS.newTransaction, icon: Wallet, tint: "bg-tint-sand" },
  { module: "spirit", label: "Journal", href: "/reflection", event: APP_EVENTS.newJournal, icon: BookHeart, tint: "bg-tint-clay" },
  { module: "health", label: "Mood", href: "/health", event: APP_EVENTS.newCheckin, icon: Smile, tint: "bg-tint-sage" },
  { module: "sleep", label: "Sleep", href: "/sleep", event: APP_EVENTS.newSleep, icon: BedDouble, tint: "bg-tint-mist" },
];

/** A bottom sheet on phones and tablets, a centered modal on desktop. */
export function QuickAdd({ hidden }: { hidden: string[] }) {
  const [open, setOpen] = useState(false);
  const openNew = useOpenNew();

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(QUICK_ADD_EVENT, onOpen);
    return () => window.removeEventListener(QUICK_ADD_EVENT, onOpen);
  }, []);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="bottom"
        aria-describedby={undefined}
        className="bg-background lg:inset-auto lg:top-1/2 lg:left-1/2 lg:w-[520px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[28px] lg:pb-2 lg:data-[state=open]:animate-fade-in"
      >
        <div className="mx-auto mt-3 h-1.5 w-10 rounded-full bg-input lg:hidden" aria-hidden />
        <SheetTitle className="px-6 pt-5 pb-4 font-display text-[26px] font-light">
          Add <span className="accent-italic">something</span>
        </SheetTitle>
        <div className="grid grid-cols-4 gap-2 px-4 pb-6">
          {QUICK_ADD.filter((q) => !hidden.includes(q.module)).map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => { setOpen(false); openNew(q.href, q.event); }}
              className="flex flex-col items-center gap-2 rounded-[22px] px-1 py-3 text-xs font-medium text-foreground transition-colors hover:bg-tint-mist active:bg-tint-mist"
            >
              <span className={`flex size-12 items-center justify-center rounded-[16px] ${q.tint} shadow-clay`}>
                <q.icon className="size-[22px]" strokeWidth={1.6} aria-hidden />
              </span>
              {q.label}
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
