"use client";

import * as React from "react";
import { Dialog as SheetPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;
const SheetTitle = SheetPrimitive.Title;

const SIDE = {
  left: "inset-y-0 left-0 w-[18rem] max-w-[85vw] data-[state=open]:animate-slide-in-left",
  bottom: "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-[28px] pb-[env(safe-area-inset-bottom)] data-[state=open]:animate-slide-in-up",
} as const;

function SheetContent({ className, children, side = "left", ...props }: React.ComponentProps<typeof SheetPrimitive.Content> & { side?: keyof typeof SIDE }) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgb(28_27_24/0.42)] backdrop-blur-sm data-[state=open]:animate-fade-in" />
      <SheetPrimitive.Content
        className={cn("fixed z-50 flex flex-col bg-sidebar shadow-raised outline-none", SIDE[side], className)}
        {...props}
      >
        {children}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetTitle };
