import type { DataSource } from "@/features/dashboard/types";

export type TaskStatus = "todo" | "in_progress" | "waiting" | "done" | "cancelled";
export type Priority = 1 | 2 | 3 | 4;

export type ReminderRecord = {
  id: string;
  title: string;
  remind_at: string;
  timezone: string;
  status: "scheduled" | "snoozed" | "delivered" | "completed" | "cancelled";
  snoozed_until: string | null;
  task_id: string | null;
  event_id: string | null;
  source: DataSource;
};

export type TaskRecord = {
  id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  priority: Priority;
  area: string;
  due_date: string | null;
  due_at: string | null;
  is_top_priority: boolean;
  completed_at: string | null;
  project_id: string | null;
  goal_id: string | null;
  parent_task_id: string | null;
  recurrence_rule: string | null;
  recurrence_tz: string | null;
  estimate_minutes: number | null;
  series_id: string | null;
  created_at: string;
  updated_at: string;
  source: DataSource;
  tags: { id: string; name: string }[];
  dependsOn: string[];
};

export type TaskWorkspace = {
  tasks: TaskRecord[];
  reminders: ReminderRecord[];
  projects: { id: string; name: string }[];
  tags: { id: string; name: string }[];
  savedViews: { id: string; name: string; filters: TaskFilters }[];
  timezone: string;
  locale: string;
  demo: boolean;
};

export type TaskView = "today" | "upcoming" | "overdue" | "nodate" | "all" | "done";

export type TaskFilters = {
  view: TaskView;
  q?: string;
  priority?: Priority;
  area?: string;
  tag?: string;
  project?: string;
};

export const AREAS = ["personal", "work", "family", "health", "finance", "learning", "home", "spiritual", "community"] as const;
export const PRIORITY_LABEL: Record<Priority, string> = { 1: "Urgent", 2: "High", 3: "Normal", 4: "Low" };
