"use client";

import { Search } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { CommandPalette, openCommandPalette } from "./command-palette";
import { MobileNav } from "./mobile-nav";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { Logo } from "./logo";

export function TopBar({ hidden, name, email, demo }: { hidden: string[]; name: string | null; email: string | null; demo: boolean }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/85 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/70 md:px-6">
      <MobileNav hidden={hidden} />
      <Logo className="lg:hidden" withText={false} />
      <button
        type="button"
        onClick={openCommandPalette}
        className="flex h-9 w-full max-w-md items-center gap-2 rounded-md border border-border bg-surface px-3 text-[13px] text-subtle-foreground transition-colors hover:border-input hover:text-muted-foreground"
        aria-keyshortcuts="Control+K Meta+K"
      >
        <Search className="size-4" aria-hidden />
        <span className="truncate">Search or jump to…</span>
        <span className="ml-auto hidden items-center gap-0.5 sm:flex" aria-hidden><Kbd>⌘</Kbd><Kbd>K</Kbd></span>
      </button>
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <UserMenu name={name} email={email} demo={demo} />
      </div>
      <CommandPalette hidden={hidden} />
    </header>
  );
}
