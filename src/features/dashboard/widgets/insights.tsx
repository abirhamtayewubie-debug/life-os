"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, Lightbulb, Lock, NotebookPen, Sparkles } from "lucide-react";
import { EmptyState } from "@/components/data/empty-state";
import { Badge } from "@/components/ui/badge";
import { formatShortDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { DashboardModel } from "../compute";
import { WidgetCard } from "./widget-card";

export function ChangesWidget({ m }: { m: DashboardModel }) {
  return (
    <WidgetCard title="Since yesterday">
      {m.changes.length ? (
        <ul className="space-y-2.5">
          {m.changes.map((c) => (
            <li key={c.id} className="flex gap-2.5 text-[13px] leading-snug">
              <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", c.tone === "positive" ? "bg-success" : c.tone === "attention" ? "bg-warning" : "bg-chart-5")} aria-hidden />
              {c.text}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState compact title="No notable changes">Completed tasks, new overdue items, spending and sleep logs from yesterday show up here.</EmptyState>
      )}
    </WidgetCard>
  );
}

export function SuggestionsWidget({ m }: { m: DashboardModel }) {
  return (
    <WidgetCard
      title="Suggestions"
      description="Rules applied to your records. Each one shows its evidence."
      actions={<Badge variant="outline"><Lightbulb aria-hidden /> Rule-based</Badge>}
    >
      {m.suggestions.length ? (
        <ul className="divide-y divide-border">
          {m.suggestions.map((s) => (
            <li key={s.id} className="py-2.5 first:pt-0 last:pb-0">
              <p className="text-[13px] leading-snug">{s.text}</p>
              <div className="mt-1 flex items-start justify-between gap-3">
                <p className="text-[11px] leading-relaxed text-muted-foreground"><span className="font-medium">Evidence:</span> {s.evidence}</p>
                <Link href={s.href} className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-brand hover:underline">
                  Review <ArrowRight className="size-3" aria-hidden />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState compact icon={Sparkles} title="Nothing to flag">As you add tasks, budgets, habits and ratings, evidence-backed suggestions appear here.</EmptyState>
      )}
      <p className="mt-3 border-t border-border pt-2.5 text-[11px] text-subtle-foreground">AI-written recommendations arrive in phase 6, and only with your permission.</p>
    </WidgetCard>
  );
}

export function JournalWidget({ m }: { m: DashboardModel }) {
  const empty = !m.journal.length && !m.notes.length;
  return (
    <WidgetCard title="Notes & journal" href="/knowledge" source={m.notes[0]?.source ?? m.journal[0]?.source}>
      {empty ? (
        <EmptyState compact icon={NotebookPen} title="Nothing written yet">Journal entries are private by default and never sent to AI unless you opt in per entry.</EmptyState>
      ) : (
        <ul className="space-y-2.5">
          {m.notes.map((n) => (
            <li key={n.id} className="flex items-start gap-2.5 text-[13px]">
              <BookOpen className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{n.title}</span>
              <span className="shrink-0 text-[11px] text-subtle-foreground capitalize">{n.kind}</span>
            </li>
          ))}
          {m.journal.map((j) => (
            <li key={j.id} className="flex items-start gap-2.5 text-[13px]">
              <NotebookPen className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{j.title ?? `${j.kind[0].toUpperCase()}${j.kind.slice(1)} entry`}</span>
              {j.is_private && <Lock className="mt-0.5 size-3 shrink-0 text-subtle-foreground" aria-label="Private" />}
              <span className="tabular shrink-0 text-[11px] text-subtle-foreground">{formatShortDate(j.entry_date)}</span>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}
