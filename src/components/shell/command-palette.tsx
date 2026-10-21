"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Command } from "cmdk";
import { useTheme } from "next-themes";
import { BookHeart, Briefcase, CalendarDays, CalendarPlus, FilePlus, FileText, LayoutGrid, ListChecks, ListPlus, Monitor, Moon, Orbit, Repeat, Search, Sun, Sunset, Target, UserPlus, Users, Wallet, Smile, Dumbbell, BedDouble } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { BUILT_THROUGH_PHASE, MODULES } from "@/lib/modules";
import { searchRecords, type SearchHit } from "@/server/actions/search";

/** Fire app-wide actions without prop drilling (e.g. open the evening review). */
export const APP_EVENTS = {
  eveningReview: "lifeos:evening-review",
  customize: "lifeos:customize-dashboard",
  newTask: "lifeos:new-task",
  newEvent: "lifeos:new-event",
  newHabit: "lifeos:new-habit",
  newGoal: "lifeos:new-goal",
  newProject: "lifeos:new-project",
  newNote: "lifeos:new-note",
  newJournal: "lifeos:new-journal",
  newAssessment: "lifeos:new-assessment",
  newPerson: "lifeos:new-person",
  newTransaction: "lifeos:new-transaction",
  newCheckin: "lifeos:new-checkin",
  newWorkout: "lifeos:new-workout",
  newSleep: "lifeos:new-sleep",
} as const;

const HIT_ICON = { task: ListChecks, event: CalendarDays, habit: Repeat, goal: Target, project: Briefcase, note: FileText, person: Users } as const;

export function openCommandPalette() {
  window.dispatchEvent(new Event("lifeos:command"));
}

export function CommandPalette({ hidden }: { hidden: string[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const latest = useRef("");

  // Debounced record search; only the newest response is kept.
  useEffect(() => {
    const q = query.trim();
    latest.current = q;
    if (q.length < 2) return;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await searchRecords(q);
        if (latest.current === q) setHits(r);
      } catch {
        if (latest.current === q) setHits([]);
      } finally {
        if (latest.current === q) setSearching(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query]);
  const shownHits = query.trim().length >= 2 ? hits : [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("lifeos:command", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("lifeos:command", onOpen);
    };
  }, []);

  const run = (fn: () => void) => {
    setOpen(false);
    setQuery("");
    fn();
  };
  // Already on the page: tell it directly. Otherwise ?new=1 opens the form on arrival.
  const goAndFire = (href: string, event: string) =>
    run(() => (pathname === href ? window.dispatchEvent(new Event(event)) : router.push(`${href}?new=1`)));

  const item =
    "flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-[13px] data-[selected=true]:bg-muted [&_svg]:size-4 [&_svg]:text-muted-foreground";
  const heading = "[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-subtle-foreground";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent hideClose className="top-[18%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0" aria-describedby={undefined}>
        <DialogTitle className="sr-only">Search and quick actions</DialogTitle>
        <Command loop className="flex flex-col">
          <div className="flex items-center gap-2 border-b border-border px-3.5">
            <Search className="size-4 text-muted-foreground" aria-hidden />
            <Command.Input autoFocus value={query} onValueChange={setQuery} placeholder="Search tasks, events, goals, notes, people and actions…" className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle-foreground" />
            <Kbd>Esc</Kbd>
          </div>
          <Command.List className="max-h-[min(60vh,420px)] overflow-y-auto p-1.5">
            <Command.Empty className="px-3 py-8 text-center text-sm text-muted-foreground">
              {searching ? "Searching…" : "No matches in your records or actions."}
            </Command.Empty>
            {shownHits.length > 0 && (
              <Command.Group heading="Records" className={heading} forceMount>
                {shownHits.map((h) => {
                  const Icon = HIT_ICON[h.kind];
                  return (
                    <Command.Item key={`${h.kind}-${h.id}`} value={`record ${h.kind} ${h.id} ${h.title}`} forceMount className={item} onSelect={() => run(() => router.push(h.href))}>
                      <Icon /> <span className="truncate">{h.title}</span>
                      <span className="ml-auto shrink-0 text-[11px] text-subtle-foreground">{h.detail ?? h.kind}</span>
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}
            <Command.Group heading="Actions" className={heading}>
              <Command.Item className={item} onSelect={() => goAndFire("/tasks", APP_EVENTS.newTask)}><ListPlus /> New task</Command.Item>
              <Command.Item className={item} onSelect={() => goAndFire("/calendar", APP_EVENTS.newEvent)}><CalendarPlus /> New event</Command.Item>
              <Command.Item className={item} onSelect={() => goAndFire("/habits", APP_EVENTS.newHabit)}><Repeat /> New habit</Command.Item>
              <Command.Item className={item} onSelect={() => goAndFire("/goals", APP_EVENTS.newGoal)}><Target /> New goal</Command.Item>
              <Command.Item className={item} onSelect={() => goAndFire("/work", APP_EVENTS.newProject)}><Briefcase /> New project</Command.Item>
              <Command.Item className={item} onSelect={() => goAndFire("/knowledge", APP_EVENTS.newNote)}><FilePlus /> New note</Command.Item>
              <Command.Item className={item} onSelect={() => goAndFire("/reflection", APP_EVENTS.newJournal)}><BookHeart /> New journal entry</Command.Item>
              <Command.Item className={item} onSelect={() => goAndFire("/wheel", APP_EVENTS.newAssessment)}><Orbit /> Wheel of Life check-in</Command.Item>
              <Command.Item className={item} onSelect={() => goAndFire("/relationships", APP_EVENTS.newPerson)}><UserPlus /> Add a person</Command.Item>
              <Command.Item className={item} onSelect={() => goAndFire("/finance", APP_EVENTS.newTransaction)}><Wallet /> New transaction</Command.Item>
              <Command.Item className={item} onSelect={() => goAndFire("/health", APP_EVENTS.newCheckin)}><Smile /> Mood &amp; energy check-in</Command.Item>
              <Command.Item className={item} onSelect={() => run(() => (pathname === "/health" ? window.dispatchEvent(new Event(APP_EVENTS.newWorkout)) : router.push("/health?tab=workouts&new=1")))}><Dumbbell /> Log a workout</Command.Item>
              <Command.Item className={item} onSelect={() => goAndFire("/sleep", APP_EVENTS.newSleep)}><BedDouble /> Log sleep</Command.Item>
              <Command.Item className={item} onSelect={() => run(() => { router.push("/"); setTimeout(() => window.dispatchEvent(new Event(APP_EVENTS.eveningReview)), 150); })}>
                <Sunset /> Start evening review
              </Command.Item>
              <Command.Item className={item} onSelect={() => run(() => { router.push("/"); setTimeout(() => window.dispatchEvent(new Event(APP_EVENTS.customize)), 150); })}>
                <LayoutGrid /> Customize dashboard
              </Command.Item>
            </Command.Group>
            <Command.Group heading="Go to" className={heading}>
              {MODULES.filter((m) => m.required || !hidden.includes(m.key)).map((m) => (
                <Command.Item key={m.key} value={`${m.label} ${m.summary}`} className={item} onSelect={() => run(() => router.push(m.href))}>
                  <m.icon /> {m.label}
                  {m.phase > BUILT_THROUGH_PHASE && <span className="ml-auto text-[11px] text-subtle-foreground">Phase {m.phase}</span>}
                </Command.Item>
              ))}
            </Command.Group>
            <Command.Group heading="Theme" className={heading}>
              <Command.Item className={item} onSelect={() => run(() => setTheme("light"))}><Sun /> Light</Command.Item>
              <Command.Item className={item} onSelect={() => run(() => setTheme("dark"))}><Moon /> Dark</Command.Item>
              <Command.Item className={item} onSelect={() => run(() => setTheme("system"))}><Monitor /> Match system</Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
