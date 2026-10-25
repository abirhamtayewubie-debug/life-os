"use client";

import Link from "next/link";
import {
  ArrowRight, BarChart3, BookOpen, Briefcase, CalendarDays, GraduationCap, HeartPulse, House, ListChecks,
  PenLine, Plug, Plus, Repeat, Search, Settings, Sparkles, Target, Users, Wallet, type LucideIcon,
} from "lucide-react";
import { IconButton } from "@/components/clay/icon-button";
import { AreaTile, type Tint } from "@/components/clay/tile";
import { openCommandPalette } from "@/components/shell/command-palette";

type Area = { key: string; name: string; href: string; icon: LucideIcon; tint: Tint };

const PLAN: Area[] = [
  { key: "calendar", name: "Calendar", href: "/calendar", icon: CalendarDays, tint: "sand" },
  { key: "tasks", name: "Tasks", href: "/tasks", icon: ListChecks, tint: "clay" },
  { key: "work", name: "Projects", href: "/work", icon: Briefcase, tint: "mist" },
  { key: "goals", name: "Goals", href: "/goals", icon: Target, tint: "sand" },
  { key: "habits", name: "Habits", href: "/habits", icon: Repeat, tint: "sage" },
  { key: "spirit", name: "Reflect", href: "/reflection", icon: PenLine, tint: "clay" },
];

const LIFE: Area[] = [
  { key: "finance", name: "Finance", href: "/finance", icon: Wallet, tint: "card" },
  { key: "health", name: "Health", href: "/health", icon: HeartPulse, tint: "card" },
  { key: "learning", name: "Learning", href: "/learning", icon: GraduationCap, tint: "card" },
  { key: "relationships", name: "People", href: "/relationships", icon: Users, tint: "card" },
  { key: "admin", name: "Home", href: "/admin", icon: House, tint: "card" },
];

const MORE: Area[] = [
  { key: "reports", name: "Reports", href: "/reports", icon: BarChart3, tint: "mist" },
  { key: "knowledge", name: "Knowledge", href: "/knowledge", icon: BookOpen, tint: "sand" },
  { key: "integrations", name: "Integrations", href: "/integrations", icon: Plug, tint: "card" },
  { key: "settings", name: "Settings", href: "/settings", icon: Settings, tint: "card" },
];

/** Every module in one place; replaces the old side drawer on phones. */
export function AreasScreen({ hidden, status = {} }: { hidden: string[]; status?: Record<string, string[]> }) {
  const visible = (list: Area[]) => list.filter((a) => a.key === "settings" || !hidden.includes(a.key));
  const grid = "grid grid-cols-3 gap-3 sm:gap-3.5 lg:grid-cols-6";
  const tiles = (list: Area[]) =>
    visible(list).map((a) => <AreaTile key={a.key} href={a.href} icon={a.icon} name={a.name} tint={a.tint} status={status[a.key]} />);

  return (
    <div className="animate-rise pt-[calc(env(safe-area-inset-top)+20px)] pb-4 md:pt-0">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-[36px] leading-tight font-normal md:text-[40px]">
          Life <span className="accent-italic-sage">areas</span>
        </h1>
        <IconButton onClick={openCommandPalette} aria-label="Search or jump to" className="md:hidden">
          <Search strokeWidth={1.6} aria-hidden />
        </IconButton>
      </div>

      {!hidden.includes("assistant") && (
        <Link href="/assistant" className="mt-5 flex items-center gap-4 rounded-[24px] bg-inverse p-4 pr-5 text-inverse-foreground shadow-clay">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[16px] bg-clay text-[#fbf8f1]">
            <Sparkles className="size-5" strokeWidth={1.6} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[18px] leading-tight">Ask your assistant</span>
            <span className="block truncate font-display text-[14px] text-inverse-muted italic">&ldquo;How balanced was my week?&rdquo;</span>
          </span>
          <ArrowRight className="size-5 shrink-0" strokeWidth={1.6} aria-hidden />
        </Link>
      )}

      <h2 className="label-caps mt-7 mb-3 font-sans">Plan</h2>
      <div className={grid}>{tiles(PLAN)}</div>

      <h2 className="label-caps mt-7 mb-3 font-sans">Life areas</h2>
      <div className={grid}>
        {tiles(LIFE)}
        <Link
          href="/settings#modules"
          className="flex min-h-[148px] flex-col items-center justify-center gap-2 rounded-[22px] border border-dashed lg:min-h-[196px] border-input text-muted-foreground transition-colors hover:bg-tint-mist"
        >
          <Plus className="size-5" strokeWidth={1.6} aria-hidden />
          <span className="font-display text-[15px]">Add area</span>
        </Link>
      </div>

      <h2 className="label-caps mt-7 mb-3 font-sans">Reflect &amp; system</h2>
      <div className={grid}>{tiles(MORE)}</div>
    </div>
  );
}
