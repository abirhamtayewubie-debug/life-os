"use client";

import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { saveAiSettings } from "@/server/actions/assistant";
import { useActionForm } from "@/components/data/action-form";
import { AI_MODULES, MODEL_IDS, MODELS, type AiModule, type AiSettings } from "@/features/assistant/models";

export function AiSettingsForm({ settings, configured, spendUsd }: { settings: AiSettings; configured: boolean; spendUsd: number | null }) {
  const { v, set, err, pending, submit } = useActionForm(() => ({ ...settings, monthlyBudgetUsd: String(settings.monthlyBudgetUsd), retainDays: String(settings.retainDays) }));
  const toggleModule = (k: AiModule, on: boolean) => set("allowedModules", on ? [...v.allowedModules, k] : v.allowedModules.filter((m) => m !== k));

  return (
    <form className="grid gap-5" onSubmit={submit(saveAiSettings, () => {})}>
      {!configured && (
        <p className="rounded-md border border-dashed border-border p-3 text-[12px] text-muted-foreground">
          The server has no Anthropic API key yet, so the assistant can&apos;t run even when switched on. You can still choose your settings now.
        </p>
      )}

      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor="ai-enabled" className="text-[13px] font-medium">Use the assistant</label>
          <p className="text-xs text-muted-foreground">When off, nothing is ever sent to Anthropic. When on, data leaves only when you ask a question or ask for a write-up, and only from the areas below.</p>
        </div>
        <Switch id="ai-enabled" checked={v.enabled} onCheckedChange={(on) => set("enabled", on)} />
      </div>

      <fieldset className="grid min-w-0 gap-2">
        <legend className="mb-1 text-[13px] font-medium">Model</legend>
        {MODEL_IDS.map((id) => (
          <label key={id} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3", v.model === id && "border-brand/50 bg-brand/5")}>
            <input type="radio" name="ai-model" value={id} checked={v.model === id} onChange={() => set("model", id)} className="mt-1" />
            <span className="grid gap-0.5">
              <span className="text-[13px] font-medium">{MODELS[id].label}</span>
              <span className="text-xs text-muted-foreground">{MODELS[id].blurb} ${MODELS[id].input} in / ${MODELS[id].output} out per million tokens.</span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="grid min-w-0 gap-1">
        <legend className="mb-1 text-[13px] font-medium">What it may read</legend>
        <p className="mb-2 text-xs text-muted-foreground">Everything is off until you switch it on. It reads through your own account, so it sees no more than you do.</p>
        <ul className="grid gap-x-6 sm:grid-cols-2">
          {AI_MODULES.map((m) => (
            <li key={m.key} className="flex items-center justify-between gap-3 py-1.5">
              <label htmlFor={`ai-mod-${m.key}`} className="text-[13px]">{m.label}</label>
              <Switch id={`ai-mod-${m.key}`} checked={v.allowedModules.includes(m.key)} onCheckedChange={(on) => toggleModule(m.key, on)} />
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset className="grid min-w-0 gap-2 rounded-xl border border-border p-3">
        <legend className="flex items-center gap-1.5 px-1 text-[13px] font-medium"><Lock className="size-3.5" aria-hidden /> Sensitive areas</legend>
        <Sensitive id="ai-health" label="Health & sleep" checked={v.includeHealth} onChange={(on) => set("includeHealth", on)}>Check-ins, sleep, workouts, water and measurements are sent when relevant. It describes them; it never diagnoses.</Sensitive>
        <Sensitive id="ai-finance" label="Finance" checked={v.includeFinance} onChange={(on) => set("includeFinance", on)}>Balances, this month&apos;s totals and upcoming bills. Account numbers aren&apos;t stored, so they&apos;re never sent.</Sensitive>
        <Sensitive id="ai-journal" label="Journal entries you mark as shareable" checked={v.includeJournal} onChange={(on) => set("includeJournal", on)}>Private entries are never sent. Only entries you&apos;ve marked &ldquo;share with assistant&rdquo; one by one, and their text goes to Anthropic.</Sensitive>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="ai-budget" label="Monthly budget (USD)" error={err("monthlyBudgetUsd")}
          hint={spendUsd !== null ? `About $${spendUsd.toFixed(2)} used this month (an estimate). The assistant stops when it's reached.` : "The assistant stops when it's reached."}>
          <Input id="ai-budget" inputMode="decimal" value={v.monthlyBudgetUsd} onChange={(e) => set("monthlyBudgetUsd", e.target.value)} aria-invalid={!!err("monthlyBudgetUsd")} />
        </Field>
        <Field id="ai-retain" label="Keep conversations for" hint="Older conversations are deleted. Confirmed changes stay.">
          <NativeSelect id="ai-retain" value={v.retainDays} onChange={(e) => set("retainDays", e.target.value)}>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="365">1 year</option>
            <option value="0">Until I delete them</option>
          </NativeSelect>
        </Field>
      </div>

      <p className="text-[11px] text-muted-foreground">What is sent is processed by Anthropic under your API account&apos;s terms; check their privacy policy for how they handle it. Set a spend limit in your Anthropic console too: that one is enforced by Anthropic, while this budget is the app&apos;s own estimate.</p>
      <div><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save assistant settings"}</Button></div>
    </form>
  );
}

function Sensitive({ id, label, checked, onChange, children }: { id: string; label: string; checked: boolean; onChange: (on: boolean) => void; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="text-[13px]">{label}</label>
        <p className="text-xs text-muted-foreground">{children}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
