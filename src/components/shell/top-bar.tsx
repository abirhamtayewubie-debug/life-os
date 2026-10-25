"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Search } from "lucide-react";
import { IconButton } from "@/components/clay/icon-button";
import { MODULES, MODULE_GROUP_LABELS } from "@/lib/modules";
import { cn } from "@/lib/utils";
import { CommandPalette, openCommandPalette } from "./command-palette";
import { isActivePath } from "./nav-items";
import { UserMenu } from "./user-menu";

const OWN_PHONE_HEADER = ["/areas", "/finance"];

/** "OVERVIEW · TODAY": where you are, shown above the page on tablets and desktop. */
function Breadcrumb() {
  const pathname = usePathname();
  if (pathname === "/areas") return <span>Life areas</span>;
  const m = [...MODULES].sort((a, b) => b.href.length - a.href.length).find((mod) => isActivePath(pathname, mod.href.split("?")[0]!));
  if (!m) return null;
  return (
    <span>
      {MODULE_GROUP_LABELS[m.group]} <span aria-hidden>·</span> {m.label}
    </span>
  );
}

export function TopBar({ hidden, name, email, demo }: { hidden: string[]; name: string | null; email: string | null; demo: boolean }) {
  // On phones these pages carry their own title row (Areas: title + search; detail pages: back · title · more).
  const pathname = usePathname();
  const ownHeader = OWN_PHONE_HEADER.some((p) => isActivePath(pathname, p));
  return (
    <header className={cn("sticky top-0 z-30 bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/70", ownHeader && "max-md:hidden")}>
      <div className="mx-auto flex h-[72px] w-full max-w-[1200px] items-center gap-3 px-5 md:px-6 lg:h-24 lg:px-10">
        <IconButton onClick={openCommandPalette} aria-label="Search or jump to" aria-keyshortcuts="Control+K Meta+K" className="md:hidden">
          <Search strokeWidth={1.6} aria-hidden />
        </IconButton>
        <div className="label-caps hidden truncate md:block">
          <Breadcrumb />
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          {/* Pages can portal their own actions here on desktop (see PageActions). */}
          <div id="page-actions" className="hidden items-center gap-2.5 lg:flex" />
          <IconButton onClick={openCommandPalette} aria-label="Search or jump to" aria-keyshortcuts="Control+K Meta+K" className="hidden md:inline-flex">
            <Search strokeWidth={1.6} aria-hidden />
          </IconButton>
          {!hidden.includes("tasks") && (
            <IconButton asChild>
              <Link href="/tasks" aria-label="Reminders">
                <Bell strokeWidth={1.6} aria-hidden />
              </Link>
            </IconButton>
          )}
          <div className="md:hidden">
            <UserMenu name={name} email={email} demo={demo} />
          </div>
        </div>
      </div>
      <CommandPalette hidden={hidden} />
    </header>
  );
}
