import { FlaskConical } from "lucide-react";

export function DemoBanner() {
  return (
    <div role="status" className="flex items-center justify-center gap-2 border-b border-dashed border-warning/50 bg-warning/8 px-4 py-1.5 text-center text-xs text-[color-mix(in_oklch,var(--warning)_60%,var(--foreground))]">
      <FlaskConical className="size-3.5 shrink-0" aria-hidden />
      <span>
        <strong className="font-semibold">Demo mode.</strong> Everything you see is generated sample data and nothing is saved. Connect Supabase to use your own data.
      </span>
    </div>
  );
}
