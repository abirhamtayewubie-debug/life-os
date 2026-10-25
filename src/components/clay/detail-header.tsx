"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { IconButton } from "./icon-button";

export type HeaderAction = { label: string; icon?: React.ComponentType<{ className?: string }>; onSelect: () => void };

/** Phone top bar for detail pages: back · centered Fraunces title · more. */
export function DetailHeader({ title, actions = [], className }: { title: string; actions?: HeaderAction[]; className?: string }) {
  const router = useRouter();
  const back = () => (window.history.length > 1 ? router.back() : router.push("/areas"));
  return (
    <div className={cn("flex items-center gap-3 pt-[calc(env(safe-area-inset-top)+16px)] pb-4 md:hidden", className)}>
      <IconButton onClick={back} aria-label="Back">
        <ChevronLeft strokeWidth={1.6} aria-hidden />
      </IconButton>
      <h1 className="min-w-0 flex-1 truncate text-center font-display text-[19px] font-normal">{title}</h1>
      {actions.length ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton aria-label={`More ${title} actions`}>
              <MoreHorizontal strokeWidth={1.6} aria-hidden />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {actions.map((a) => (
              <DropdownMenuItem key={a.label} onSelect={a.onSelect}>
                {a.icon && <a.icon />} {a.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span className="size-11" aria-hidden />
      )}
    </div>
  );
}
