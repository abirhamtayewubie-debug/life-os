"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { useTheme } from "next-themes";
import { LayoutGrid, Monitor, Moon, Search, Sun, Sunset } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { MODULES } from "@/lib/modules";

/** Fire app-wide actions without prop drilling (e.g. open the evening review). */
export const APP_EVENTS = { eveningReview: "lifeos:evening-review", customize: "lifeos:customize-dashboard" } as const;

export function openCommandPalette() {
  window.dispatchEvent(new Event("lifeos:command"));
}

export function CommandPalette({ hidden }: { hidden: string[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { setTheme } = useTheme();

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
    fn();
  };

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
            <Command.Input autoFocus placeholder="Search modules and actions…" className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle-foreground" />
            <Kbd>Esc</Kbd>
          </div>
          <Command.List className="max-h-[min(60vh,420px)] overflow-y-auto p-1.5">
            <Command.Empty className="px-3 py-8 text-center text-sm text-muted-foreground">
              No matches. Record search arrives with each module (tasks in Phase 2).
            </Command.Empty>
            <Command.Group heading="Actions" className={heading}>
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
                  {m.phase > 1 && <span className="ml-auto text-[11px] text-subtle-foreground">Phase {m.phase}</span>}
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
