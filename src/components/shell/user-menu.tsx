"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { LogOut, Monitor, Moon, Settings, ShieldCheck, Sun } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, initialFor } from "@/components/clay/icon-button";
import { signOut } from "@/server/actions/auth";

/** Phone account menu behind the avatar; it also holds the light / night switch. */
export function UserMenu({ name, email, demo }: { name: string | null; email: string | null; demo: boolean }) {
  const { setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="rounded-[16px]" aria-label="Account menu">
          <Avatar initial={initialFor(name, email, demo)} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="truncate text-[13px] font-medium text-foreground">{demo ? "Demo visitor" : name ?? "Signed in"}</div>
          <div className="truncate">{demo ? "Nothing is saved in demo mode" : email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setTheme("light")}><Sun /> Light</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("dark")}><Moon /> Night</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("system")}><Monitor /> Match device</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link href="/settings"><Settings /> Settings</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/settings#privacy"><ShieldCheck /> Privacy & data</Link></DropdownMenuItem>
        {!demo && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void signOut()}><LogOut /> Sign out</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
