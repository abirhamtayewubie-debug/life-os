import type { Rate } from "@/features/finance/ledger";
import type { DataSource } from "@/features/dashboard/types";
import type { MilestoneRecord } from "@/features/goals/types";
import type { ReminderRecord, TaskRecord } from "@/features/tasks/types";

export type ProjectStatus = "planned" | "active" | "on_hold" | "completed" | "cancelled";

export type ProjectRecord = {
  id: string;
  goal_id: string | null;
  name: string;
  description: string | null;
  status: ProjectStatus;
  area: string;
  start_date: string | null;
  due_date: string | null;
  budget_amount: string | null;
  budget_currency: string | null;
  source: DataSource;
};

/** Project work is ordinary tasks with a project_id: one task system, shown here as a board. */
export type ProjectTask = TaskRecord;

export type TimeEntry = {
  id: string;
  project_id: string | null;
  task_id: string | null;
  started_at: string;
  ended_at: string | null;
  note: string | null;
  source: DataSource;
};

export type WorkWorkspace = {
  projects: ProjectRecord[];
  tasks: ProjectTask[];
  /** Open reminders on project tasks, for the in-place task detail. */
  reminders: ReminderRecord[];
  milestones: MilestoneRecord[];
  time: TimeEntry[];
  goals: { id: string; title: string }[];
  /** Posted expenses linked to a project, for spending against its budget. */
  spending: { project_id: string; amount: string; currency: string; occurred_on: string }[];
  rates: Rate[];
  currencies: string[];
  baseCurrency: string;
  today: string;
  timezone: string;
  locale: string;
  demo: boolean;
};

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planned: "Planned", active: "Active", on_hold: "On hold", completed: "Completed", cancelled: "Cancelled",
};
/**
 * Board columns map onto the existing task statuses: "Blocked" is the
 * `waiting` status (stuck on someone or something), so no task changes meaning.
 */
export const BOARD_COLUMNS = [
  { status: "todo", label: "To do" },
  { status: "in_progress", label: "Doing" },
  { status: "waiting", label: "Blocked" },
  { status: "done", label: "Done" },
] as const;
export type BoardStatus = (typeof BOARD_COLUMNS)[number]["status"];
export const BOARD_LABEL: Record<BoardStatus, string> = Object.fromEntries(BOARD_COLUMNS.map((c) => [c.status, c.label])) as Record<BoardStatus, string>;
