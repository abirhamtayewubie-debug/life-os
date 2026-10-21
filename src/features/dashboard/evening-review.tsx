"use client";

import { useEffect, useState } from "react";
import { Moon, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { saveEveningReview } from "@/server/actions/dashboard";
import { APP_EVENTS } from "@/components/shell/command-palette";
import { useServerAction } from "./use-server-action";
import type { RawReview } from "./types";

function Scale({ label, value, onChange, low, high }: { label: string; value: number | null; onChange: (v: number | null) => void; low: string; high: string }) {
  return (
    <fieldset>
      <legend className="text-[13px] font-medium">{label} <span className="font-normal text-muted-foreground">(optional)</span></legend>
      <div className="mt-2 flex items-center gap-1.5">
        <span className="w-10 text-[11px] text-muted-foreground">{low}</span>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            aria-label={`${label} ${n} of 5`}
            onClick={() => onChange(value === n ? null : n)}
            className={cn(
              "tabular size-8 cursor-pointer rounded-md border border-border text-xs transition-colors hover:border-brand",
              value === n && "border-brand bg-brand text-brand-foreground",
            )}
          >
            {n}
          </button>
        ))}
        <span className="w-10 text-right text-[11px] text-muted-foreground">{high}</span>
      </div>
    </fieldset>
  );
}

export function EveningReview({ existing, unfinishedHints }: { existing: RawReview | null; unfinishedHints: string[] }) {
  const [open, setOpen] = useState(false);
  const [achievements, setAchievements] = useState(existing?.achievements ?? "");
  const [unfinished, setUnfinished] = useState(existing?.unfinished ?? "");
  const [priorities, setPriorities] = useState<string[]>(existing?.tomorrow_priorities.length ? existing.tomorrow_priorities : [""]);
  const [mood, setMood] = useState<number | null>(existing?.mood ?? null);
  const [energy, setEnergy] = useState<number | null>(existing?.energy ?? null);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const { pending, run } = useServerAction();

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(APP_EVENTS.eveningReview, onOpen);
    return () => window.removeEventListener(APP_EVENTS.eveningReview, onOpen);
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    run(
      async () => {
        const r = await saveEveningReview({ achievements, unfinished, priorities: priorities.map((p) => p.trim()).filter(Boolean), mood, energy });
        if (!r.ok && r.fieldErrors) setErrors(r.fieldErrors);
        return r;
      },
      { onSuccess: () => setOpen(false) },
    );
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Moon /> {existing ? "Edit evening review" : "Evening review"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Evening review</DialogTitle>
            <DialogDescription>Close the day in two minutes. Every field is optional.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="grid gap-5">
            <div className="grid gap-1.5">
              <Label htmlFor="achievements">What went well or got done?</Label>
              <Textarea id="achievements" value={achievements} onChange={(e) => setAchievements(e.target.value)} maxLength={5000} placeholder="Finished the logo concepts; good conversation with…" aria-invalid={!!errors.achievements} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="unfinished">What&apos;s unfinished?</Label>
              <Textarea id="unfinished" value={unfinished} onChange={(e) => setUnfinished(e.target.value)} maxLength={5000} className="min-h-16" placeholder={unfinishedHints.length ? unfinishedHints.slice(0, 2).join(", ") : "Anything to carry over"} />
            </div>
            <div className="grid gap-1.5">
              <Label>Tomorrow&apos;s top priorities</Label>
              <div className="grid gap-2">
                {priorities.map((p, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="tabular flex h-9 w-5 items-center text-xs text-muted-foreground">{i + 1}</span>
                    <Input value={p} maxLength={200} aria-label={`Priority ${i + 1}`} onChange={(e) => setPriorities((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))} />
                    {priorities.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" aria-label={`Remove priority ${i + 1}`} onClick={() => setPriorities((xs) => xs.filter((_, j) => j !== i))}>
                        <X />
                      </Button>
                    )}
                  </div>
                ))}
                {priorities.length < 3 && (
                  <Button type="button" variant="ghost" size="sm" className="justify-self-start text-muted-foreground" onClick={() => setPriorities((xs) => [...xs, ""])}>
                    <Plus /> Add priority
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">Three is plenty. They&apos;ll appear in tomorrow&apos;s “Since yesterday”.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Scale label="Mood" value={mood} onChange={setMood} low="Low" high="Great" />
              <Scale label="Energy" value={energy} onChange={setEnergy} low="Drained" high="High" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save review"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
