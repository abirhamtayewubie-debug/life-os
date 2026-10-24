"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { LogOut, Moon, MoreHorizontal, PanelLeft, Plus, Settings, ShieldCheck, Sparkles, Sun } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Avatar, initialFor } from "@/components/clay/icon-button";
import { signOut } from "@/server/actions/auth";
import { useMounted } from "@/lib/use-mounted";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { NavItems } from "./nav-items";
import { openQuickAdd } from "./quick-add";

export const SIDEBAR_COOKIE = "lifeos_sidebar";

type Account = { name: string | null; email: string | null; demo: boolean };

/** Desktop sidebar (260px) that becomes a 72px icon rail on tablets, or on desktop with `[`. */
export function Sidebar({ hidden, initialCollapsed, account }: { hidden: string[]; initialCollapsed: boolean; account: Account }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "[" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const wideOnly = collapsed ? "hidden" : "max-lg:hidden";
  const railOnly = collapsed ? "" : "lg:hidden";
  const rail = collapsed ? "justify-center px-0" : "max-lg:justify-center max-lg:px-0";

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-sidebar transition-[width] duration-200 ease-out md:flex",
        collapsed ? "w-[72px]" : "w-[72px] lg:w-[260px]",
      )}
      aria-label="Sidebar"
    >
      <div className={cn("flex h-20 shrink-0 items-center px-6", rail)}>
        <Link href="/" className="rounded-[14px]" aria-label="Life OS home">
          <Logo withText={false} className={railOnly} />
          <Logo className={wideOnly} />
        </Link>
      </div>

      <div className={cn("flex flex-col gap-3 px-4 pb-5", collapsed ? "px-3" : "max-lg:px-3")}>
        <RailTip label="New" railOnly={railOnly}>
          <button
            type="button"
            onClick={openQuickAdd}
            aria-haspopup="dialog"
            className={cn("flex h-12 items-center justify-center gap-2 rounded-[16px] bg-primary font-display text-[17px] text-primary-foreground shadow-clay transition-transform active:scale-[0.98]", rail)}
          >
            <Plus className="size-5" strokeWidth={1.6} aria-hidden />
            <span className={collapsed ? "sr-only" : "max-lg:sr-only"}>New</span>
          </button>
        </RailTip>
        {!hidden.includes("assistant") && (
          <RailTip label="Ask your assistant" railOnly={railOnly}>
            <Link
              href="/assistant"
              className={cn("flex h-12 items-center gap-2.5 rounded-full border border-border px-4 text-muted-foreground transition-colors hover:bg-tint-mist", rail)}
            >
              <Sparkles className="size-[18px] shrink-0 text-clay" strokeWidth={1.6} aria-hidden />
              <span className={cn("truncate font-display text-[16px] italic", collapsed ? "sr-only" : "max-lg:sr-only")}>Ask your assistant…</span>
            </Link>
          </RailTip>
        )}
      </div>

      <div className={cn("flex-1 overflow-y-auto px-4 pb-4", collapsed ? "px-3" : "max-lg:px-3")}>
        <NavItems hidden={hidden} collapsed={collapsed} />
      </div>

      <SidebarFooter account={account} collapsed={collapsed} onToggleCollapse={toggle} />
    </aside>
  );
}

function RailTip({ label, railOnly, children }: { label: string; railOnly: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" className={railOnly}>{label}</TooltipContent>
    </Tooltip>
  );
}

function SidebarFooter({ account, collapsed, onToggleCollapse }: { account: Account; collapsed: boolean; onToggleCollapse: () => void }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  const dark = mounted && resolvedTheme === "dark";
  const wideOnly = collapsed ? "hidden" : "max-lg:hidden";
  const name = account.demo ? "Demo visitor" : account.name ?? account.email ?? "You";

  const iconBtn = "flex size-11 shrink-0 items-center justify-center rounded-[14px] text-muted-foreground transition-colors hover:bg-tint-mist hover:text-foreground [&_svg]:size-5";

  return (
    <div className={cn("mx-4 flex shrink-0 items-center gap-2 border-t border-border py-4", collapsed ? "mx-3 flex-col" : "max-lg:mx-3 max-lg:flex-col")}>
      <Link href="/settings" className="flex min-w-0 flex-1 items-center gap-3 rounded-[16px]" aria-label={`${name}, settings`}>
        <Avatar initial={initialFor(account.name, account.email, account.demo)} />
        <span className={cn("min-w-0", wideOnly)}>
          <span className="block truncate font-display text-[16px]">{name}</span>
          <span className="block truncate text-xs text-muted-foreground">Personal workspace</span>
        </span>
      </Link>
      <button type="button" onClick={() => setTheme(dark ? "light" : "dark")} className={iconBtn} aria-label={dark ? "Switch to light mode" : "Switch to night mode"}>
        {dark ? <Sun strokeWidth={1.6} /> : <Moon strokeWidth={1.6} />}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={iconBtn} aria-label="More">
            <MoreHorizontal strokeWidth={1.6} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" className="w-56">
          <DropdownMenuItem asChild><Link href="/settings"><Settings /> Settings</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link href="/settings#privacy"><ShieldCheck /> Privacy & data</Link></DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setTheme("system")}><Sun /> Match device theme</DropdownMenuItem>
          <DropdownMenuItem onSelect={onToggleCollapse} className="max-lg:hidden">
            <PanelLeft /> {collapsed ? "Expand" : "Collapse"} sidebar <span className="ml-auto text-xs opacity-60">[</span>
          </DropdownMenuItem>
          {!account.demo && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void signOut()}><LogOut /> Sign out</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
