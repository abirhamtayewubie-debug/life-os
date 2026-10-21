"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfile, type ProfileInput } from "@/server/actions/settings";
import { useServerAction } from "@/features/dashboard/use-server-action";
import type { ViewerProfile } from "@/features/dashboard/types";

const ZONES = ["Africa/Addis_Ababa", "Africa/Nairobi", "America/Toronto", "America/Vancouver", "America/New_York", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Asia/Dubai", "UTC"];

export function PreferencesForm({ profile, weekStartsOn }: { profile: ViewerProfile; weekStartsOn: number }) {
  const [v, setV] = useState({ displayName: profile.displayName ?? "", timezone: profile.timezone, baseCurrency: profile.baseCurrency, locale: profile.locale, weekStartsOn, measurementSystem: profile.measurementSystem });
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const { pending, run } = useServerAction();
  const zones = ZONES.includes(v.timezone) ? ZONES : [v.timezone, ...ZONES];
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: k === "weekStartsOn" ? Number(e.target.value) : e.target.value }));

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        run(async () => {
          const r = await updateProfile(v as ProfileInput);
          if (!r.ok && r.fieldErrors) setErrors(r.fieldErrors);
          return r;
        });
      }}
    >
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="displayName">Name</Label>
        <Input id="displayName" value={v.displayName} onChange={set("displayName")} maxLength={80} placeholder="Used in your greeting" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="timezone">Time zone</Label>
        <NativeSelect id="timezone" value={v.timezone} onChange={set("timezone")} aria-invalid={!!errors.timezone}>
          {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
        </NativeSelect>
        <Button type="button" variant="link" size="xs" className="justify-self-start" onClick={() => setV((s) => ({ ...s, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }))}>
          Use this device&apos;s time zone
        </Button>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="baseCurrency">Main currency</Label>
        <NativeSelect id="baseCurrency" value={v.baseCurrency} onChange={set("baseCurrency")}>
          {["ETB", "USD", "CAD", "EUR", "GBP", "KES", "AED"].map((c) => <option key={c}>{c}</option>)}
        </NativeSelect>
        <p className="text-[11px] text-muted-foreground">Accounts keep their own currency. This is only the default for new records.</p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="locale">Number & date format</Label>
        <NativeSelect id="locale" value={v.locale} onChange={set("locale")}>
          <option value="en-US">English (US)</option>
          <option value="en-CA">English (Canada)</option>
          <option value="en-GB">English (UK)</option>
          <option value="am-ET">Amharic (Ethiopia)</option>
        </NativeSelect>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="weekStartsOn">Week starts on</Label>
        <NativeSelect id="weekStartsOn" value={v.weekStartsOn} onChange={set("weekStartsOn")}>
          <option value={1}>Monday</option>
          <option value={0}>Sunday</option>
          <option value={6}>Saturday</option>
        </NativeSelect>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="measurementSystem">Units</Label>
        <NativeSelect id="measurementSystem" value={v.measurementSystem} onChange={set("measurementSystem")}>
          <option value="metric">Metric (kg, cm)</option>
          <option value="imperial">Imperial (lb, in)</option>
        </NativeSelect>
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save preferences"}</Button>
      </div>
    </form>
  );
}
