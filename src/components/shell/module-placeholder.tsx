import Link from "next/link";
import { Check, Database } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getModule } from "@/lib/modules";
import { PageHeader } from "./page-header";

const TABLES: Record<string, string[]> = {
  assistant: ["ai_settings", "ai_conversations", "ai_messages", "ai_tool_calls"],
  calendar: ["calendar_events", "reminders"],
  tasks: ["tasks", "task_tags", "task_dependencies", "reminders", "reminder_deliveries"],
  goals: ["goals", "goal_progress_entries", "milestones"],
  habits: ["habits", "habit_logs"],
  finance: ["financial_accounts", "transactions", "transaction_categories", "budgets", "budget_lines", "recurring_transactions", "savings_goals", "exchange_rates"],
  health: ["workouts", "workout_sets", "body_measurements", "wellness_logs", "hydration_logs"],
  sleep: ["sleep_logs"],
  work: ["projects", "milestones", "tasks", "calendar_events"],
  learning: ["learning_items", "skills"],
  spirit: ["journal_entries", "habits"],
  relationships: ["people", "important_dates"],
  admin: ["tasks", "notes", "important_dates", "recurring_transactions"],
  wheel: ["wheel_categories", "wheel_assessments", "wheel_ratings"],
  reports: ["reports"],
  knowledge: ["notes", "note_tags", "record_links", "tags"],
  integrations: ["integrations", "integration_credentials"],
};

export function ModulePlaceholder({ moduleKey }: { moduleKey: string }) {
  const m = getModule(moduleKey);
  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow={<Badge variant="outline">Arrives in phase {m.phase}</Badge>}
        title={m.label}
        description={m.summary}
        actions={<Button variant="outline" size="sm" asChild><Link href="/">Back to Today</Link></Button>}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>What this module will do</CardTitle></CardHeader>
          <CardContent>
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {m.capabilities.map((c) => (
                <li key={c} className="flex gap-2 text-sm text-muted-foreground">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
            <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
              This screen has no working controls yet on purpose: nothing here pretends to save. It becomes interactive in phase {m.phase}.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Already in place</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">The database tables for this module exist, with row-level security that limits every row to its owner:</p>
            <ul className="flex flex-wrap gap-1.5">
              {(TABLES[m.key] ?? []).map((t) => (
                <li key={t}><Badge variant="outline" className="font-mono"><Database aria-hidden />{t}</Badge></li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
