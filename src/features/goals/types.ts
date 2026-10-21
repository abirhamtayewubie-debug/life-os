import type { DataSource } from "@/features/dashboard/types";

export type GoalLevel = "vision" | "long_term" | "annual" | "quarterly";
export type GoalStatus = "active" | "paused" | "completed" | "abandoned";

export type GoalRecord = {
  id: string;
  parent_id: string | null;
  wheel_category_id: string | null;
  level: GoalLevel;
  title: string;
  description: string | null;
  why: string | null;
  status: GoalStatus;
  target_date: string | null;
  metric_label: string | null;
  /** Numeric columns arrive as strings to keep them exact. */
  metric_target: string | null;
  metric_current: string | null;
  completed_at: string | null;
  source: DataSource;
};

export type MilestoneRecord = {
  id: string;
  project_id: string | null;
  goal_id: string | null;
  title: string;
  due_date: string | null;
  completed_at: string | null;
  sort_order: number;
  source: DataSource;
};

export type ProgressEntry = { id: string; goal_id: string; value: string; note: string | null; recorded_at: string; source: DataSource };

export type GoalLinks = { projects: number; openTasks: number; habits: number; learning: number };

export type GoalWorkspace = {
  goals: GoalRecord[];
  milestones: MilestoneRecord[];
  progress: ProgressEntry[];
  links: Record<string, GoalLinks>;
  categories: { id: string; name: string }[];
  today: string;
  timezone: string;
  locale: string;
  demo: boolean;
};

export const LEVELS: GoalLevel[] = ["vision", "long_term", "annual", "quarterly"];
export const LEVEL_LABEL: Record<GoalLevel, string> = { vision: "Vision", long_term: "Long-term", annual: "This year", quarterly: "This quarter" };
export const STATUS_LABEL: Record<GoalStatus, string> = { active: "Active", paused: "Paused", completed: "Achieved", abandoned: "Let go" };

export type GoalInputDefaults = Partial<import("@/server/actions/goals").GoalInput>;
