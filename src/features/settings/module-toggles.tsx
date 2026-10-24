"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { NAV_MODULES } from "@/lib/modules";
import { setModuleEnabled } from "@/server/actions/settings";
import { useServerAction } from "@/features/dashboard/use-server-action";

export function ModuleToggles({ hidden }: { hidden: string[] }) {
  const [off, setOff] = useState(new Set(hidden));
  const { run } = useServerAction();
  return (
    <ul className="divide-y divide-border">
      {NAV_MODULES.filter((m) => !m.required).map((m) => {
        const enabled = !off.has(m.key);
        return (
          <li key={m.key} className="flex items-center gap-3 py-2.5">
            <m.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1">
              <label htmlFor={`mod-${m.key}`} className="text-[13px] font-medium">{m.label}</label>
              <p className="truncate text-xs text-muted-foreground">{m.summary}</p>
            </div>
            <Switch
              id={`mod-${m.key}`}
              checked={enabled}
              onCheckedChange={(next) => {
                const apply = (on: boolean) => setOff((s) => { const n = new Set(s); if (on) n.delete(m.key); else n.add(m.key); return n; });
                apply(next);
                run(() => setModuleEnabled(m.key, next), { onError: () => apply(!next), quiet: true });
              }}
            />
          </li>
        );
      })}
    </ul>
  );
}
