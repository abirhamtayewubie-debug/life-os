import * as React from "react";
import { cn } from "@/lib/utils";

const fieldClass =
  "w-full min-w-0 rounded-md border border-input bg-surface px-3 text-sm text-foreground placeholder:text-subtle-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20";

function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input data-slot="input" className={cn(fieldClass, "h-9", className)} {...props} />;
}

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn(fieldClass, "min-h-20 py-2 leading-relaxed", className)} {...props} />;
}

function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return <select data-slot="select" className={cn(fieldClass, "h-9 pr-8", className)} {...props} />;
}

export { Input, Textarea, NativeSelect, fieldClass };
