"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { setTaskDone } from "@/server/actions/dashboard";
import { useServerAction } from "../use-server-action";
import type { TaskView } from "../compute";
import { ProvenanceBadge } from "@/components/data/provenance";

const PRIORITY: Record<number, { label: string; className: string }> = {
  1: { label: "Urgent", className: "bg-destructive" },
  2: { label: "High", className: "bg-warning" },
  3: { label: "Normal", className: "bg-chart-5/60" },
  4: { label: "Low", className: "bg-border" },
};

export function TaskRow({ task, showDue = true, showSource = false }: { task: TaskView; showDue?: boolean; showSource?: boolean }) {
  const [done, setDone] = useState(task.status === "done");
  const { pending, run } = useServerAction();
  const toggle = () => {
    const next = !done;
    setDone(next);
    run(() => setTaskDone(task.id, next), { onError: () => setDone(!next), quiet: true });
  };
  const p = PRIORITY[task.priority];
  return (
    <li className="group flex items-start gap-3 py-2.5">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={`Mark “${task.title}” ${done ? "not done" : "done"}`}
        onClick={toggle}
        disabled={pending}
        className={cn(
          "relative flex size-[22px] shrink-0 cursor-pointer items-center justify-center rounded-full border-[1.5px] border-input transition-colors before:absolute before:-inset-2.5 before:content-[''] hover:border-brand",
          done && "animate-pop border-brand bg-brand text-brand-foreground",
        )}
      >
        {done && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm leading-snug font-medium text-foreground", done && "font-normal text-muted-foreground line-through")}>{task.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className={cn("size-1.5 rounded-full", p.className)} aria-hidden />
            {p.label}
          </span>
          {showDue && task.dueLabel && (
            <span className={cn(task.late && "text-destructive")}>{task.late ? task.dueLabel : `Due ${task.dueLabel}`}</span>
          )}
          <span className="capitalize">{task.area}</span>
          {showSource && <ProvenanceBadge source={task.source} />}
        </div>
      </div>
    </li>
  );
}
