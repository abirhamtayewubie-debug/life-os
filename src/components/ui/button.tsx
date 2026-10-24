import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[16px] text-sm font-medium transition-[color,background-color,box-shadow,transform] duration-150 outline-none active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-clay hover:bg-primary/88",
        brand: "bg-brand text-brand-foreground hover:bg-brand/90",
        secondary: "bg-accent text-accent-foreground hover:bg-accent/80",
        outline: "bg-surface shadow-[inset_0_0_0_1px_var(--border),var(--shadow-clay)] hover:bg-surface-2",
        ghost: "hover:bg-muted text-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        link: "text-brand underline-offset-4 hover:underline px-0",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-9 px-3 text-[13px] rounded-[14px]",
        xs: "h-7 px-2.5 text-xs rounded-lg",
        lg: "h-12 px-6 text-[15px] rounded-2xl",
        icon: "size-10",
        "icon-sm": "size-9 rounded-[14px]",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
