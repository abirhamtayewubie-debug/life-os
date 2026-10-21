"use client";

import { useState } from "react";
import { Check, Flag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatShortDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { addMilestone, deleteMilestone, setMilestoneDone } from "@/server/actions/goals";
import { useServerAction } from "@/features/dashboard/use-server-action";
import type { MilestoneRecord } from "./types";

/** Milestones for one goal or project: add, tick off, remove. */
export function MilestoneList({
  milestones, parent, today, locale,
}: {
  milestones: MilestoneRecord[];
  parent: { goalId: string } | { projectId: string };
  today: string;
  locale: string;
}) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const { pending, run } = useServerAction();
  const sorted = [...milestones].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="grid gap-2">
      {sorted.length > 0 && (
        <ol className="grid gap-1">
          {sorted.map((m) => {
            const late = !m.completed_at && m.due_date && m.due_date < today;
            return (
              <li key={m.id} className="group flex items-center gap-2.5 rounded-md px-1.5 py-1 text-[13px] hover:bg-muted/60">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={!!m.completed_at}
                  aria-label={`Mark “${m.title}” ${m.completed_at ? "not reached" : "reached"}`}
                  disabled={pending}
                  onClick={() => run(() => setMilestoneDone(m.id, !m.completed_at), { quiet: true })}
                  className={cn("flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full border border-input", m.completed_at && "border-success bg-success text-white")}
                >
                  {m.completed_at && <Check className="size-3" aria-hidden />}
                </button>
                <span className={cn("min-w-0 flex-1 truncate", m.completed_at && "text-muted-foreground line-through")}>{m.title}</span>
                {m.due_date && <span className={cn("tabular shrink-0 text-[11px] text-muted-foreground", late && "text-destructive")}>{formatShortDate(m.due_date, locale)}</span>}
                <Button variant="ghost" size="icon-sm" className="size-6 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Remove milestone ${m.title}`} onClick={() => run(() => deleteMilestone(m.id), { quiet: true })}><X /></Button>
              </li>
            );
          })}
        </ol>
      )}
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          run(() => addMilestone({ title, dueDate: due, ...("goalId" in parent ? { goalId: parent.goalId } : { projectId: parent.projectId }) }), {
            quiet: true,
            onSuccess: () => { setTitle(""); setDue(""); },
          });
        }}
      >
        <Input className="min-w-40 flex-1" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="Add a milestone" aria-label="New milestone" />
        <Input className="w-auto" type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Milestone date" />
        <Button type="submit" variant="outline" disabled={pending || !title.trim()}><Flag /> Add</Button>
      </form>
    </div>
  );
}
