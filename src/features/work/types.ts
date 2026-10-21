import type { DataSource } from "@/features/dashboard/types";
import type { MilestoneRecord } from "@/features/goals/types";

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

export type ProjectTask = {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "waiting" | "done" | "cancelled";
  priority: number;
  project_id: string | null;
  due_date: string | null;
  due_at: string | null;
  parent_task_id: string | null;
  source: DataSource;
};

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
  milestones: MilestoneRecord[];
  time: TimeEntry[];
  goals: { id: string; title: string }[];
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
export const BOARD_COLUMNS = [
  { status: "todo", label: "To do" },
  { status: "in_progress", label: "In progress" },
  { status: "waiting", label: "Waiting" },
  { status: "done", label: "Done" },
] as const;
