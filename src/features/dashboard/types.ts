/**
 * Raw record shapes mirror the Postgres columns the Command Center reads.
 * The same shapes come from Supabase (live) or the sample generator (demo),
 * so one pure pipeline (compute.ts) builds the dashboard in both modes.
 */

export type DataSource = "manual" | "imported" | "device" | "integration" | "estimate" | "ai_suggested" | "sample";

export type RawTask = {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "waiting" | "done" | "cancelled";
  priority: 1 | 2 | 3 | 4;
  area: string;
  due_date: string | null;
  due_at: string | null;
  is_top_priority: boolean;
  completed_at: string | null;
  project_id: string | null;
  goal_id: string | null;
  created_at: string;
  source: DataSource;
};

export type RawEvent = {
  id: string;
  title: string;
  kind: "event" | "meeting" | "appointment" | "time_block" | "reminder_only";
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string | null;
  source: DataSource;
};

export type RawReminder = {
  id: string;
  title: string;
  remind_at: string;
  status: "scheduled" | "snoozed" | "delivered" | "completed" | "cancelled";
  snoozed_until: string | null;
  source: DataSource;
};

export type RawHabit = {
  id: string;
  name: string;
  cadence: "daily" | "weekly";
  schedule_days: number[];
  target_per_period: number;
  time_of_day: "morning" | "afternoon" | "evening" | "anytime" | null;
  paused_at: string | null;
  created_at: string;
  source: DataSource;
};

export type RawHabitLog = { habit_id: string; log_date: string; count: number };

export type RawGoal = {
  id: string;
  title: string;
  level: "vision" | "long_term" | "annual" | "quarterly";
  status: "active" | "paused" | "completed" | "abandoned";
  target_date: string | null;
  metric_label: string | null;
  metric_target: string | null;
  metric_current: string | null;
  wheel_category_id: string | null;
  updated_at: string;
  source: DataSource;
};

export type RawProject = {
  id: string;
  name: string;
  status: "planned" | "active" | "on_hold" | "completed" | "cancelled";
  area: string;
  due_date: string | null;
  source: DataSource;
};

export type RawAccount = {
  id: string;
  name: string;
  kind: string;
  currency: string;
  is_liability: boolean;
  balance: string; // ledger balance from account_balances view
  source: DataSource;
};

export type RawCategory = { id: string; name: string; kind: "income" | "expense"; parent_id: string | null };

export type RawBudget = {
  id: string;
  name: string;
  period: "weekly" | "monthly";
  currency: string;
  lines: { category_id: string; amount: string }[];
  source: DataSource;
};

export type RawTransaction = {
  id: string;
  account_id: string;
  category_id: string | null;
  kind: "income" | "expense" | "transfer" | "adjustment";
  amount: string;
  currency: string;
  occurred_on: string;
  description: string | null;
  source: DataSource;
};

export type RawWellness = { log_date: string; mood: number | null; energy: number | null; stress: number | null; source: DataSource };

export type RawSleep = {
  sleep_date: string;
  bedtime: string;
  wake_time: string;
  duration_minutes: number;
  quality: number | null;
  source: DataSource;
};

export type RawWheelCategory = { id: string; name: string; sort_order: number };
export type RawWheelAssessment = {
  id: string;
  assessed_on: string;
  ratings: { category_id: string; score: number; desired_score: number | null }[];
  source: DataSource;
};

export type RawJournal = { id: string; entry_date: string; kind: string; title: string | null; is_private: boolean; source: DataSource };
export type RawNote = { id: string; title: string; kind: string; updated_at: string; source: DataSource };

export type RawReview = {
  review_date: string;
  kind: "morning" | "evening" | "weekly";
  achievements: string | null;
  unfinished: string | null;
  tomorrow_priorities: string[];
  mood: number | null;
  energy: number | null;
  notes: string | null;
};

export type RawLifeData = {
  tasks: RawTask[];
  events: RawEvent[];
  reminders: RawReminder[];
  habits: RawHabit[];
  habitLogs: RawHabitLog[];
  goals: RawGoal[];
  projects: RawProject[];
  accounts: RawAccount[];
  categories: RawCategory[];
  budgets: RawBudget[];
  transactions: RawTransaction[];
  wellness: RawWellness[];
  sleep: RawSleep[];
  wheelCategories: RawWheelCategory[];
  wheelAssessments: RawWheelAssessment[];
  journal: RawJournal[];
  notes: RawNote[];
  reviews: RawReview[];
};

export type ViewerProfile = {
  displayName: string | null;
  timezone: string;
  locale: string;
  baseCurrency: string;
  measurementSystem: "metric" | "imperial";
};
