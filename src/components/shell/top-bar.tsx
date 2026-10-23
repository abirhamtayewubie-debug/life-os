"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { CommandPalette, openCommandPalette } from "./command-palette";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { Logo } from "./logo";

export function TopBar({ hidden, name, email, demo }: { hidden: string[]; name: string | null; email: string | null; demo: boolean }) {
  return (
    <header className="sticky top-0 z-30 bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/65">
      <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center gap-2 px-4 md:px-6 lg:h-20 lg:px-10">
        <Link href="/" className="rounded-xl lg:hidden" aria-label="Life OS home">
          <Logo withText={false} />
        </Link>
        <button
          type="button"
          onClick={openCommandPalette}
          className="hidden h-10 w-full max-w-sm items-center gap-2.5 rounded-xl bg-surface px-3.5 text-sm text-subtle-foreground shadow-card transition-[color,box-shadow] hover:text-muted-foreground hover:shadow-raised sm:flex"
          aria-keyshortcuts="Control+K Meta+K"
        >
          <Search className="size-4" aria-hidden />
          <span className="truncate">Search or jump to…</span>
          <span className="ml-auto hidden items-center gap-0.5 md:flex" aria-hidden><Kbd>⌘</Kbd><Kbd>K</Kbd></span>
        </button>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={openCommandPalette}
            className="flex size-10 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-muted sm:hidden"
            aria-label="Search or jump to"
          >
            <Search className="size-5" aria-hidden />
          </button>
          <ThemeToggle />
          <UserMenu name={name} email={email} demo={demo} />
        </div>
      </div>
      <CommandPalette hidden={hidden} />
    </header>
  );
}
