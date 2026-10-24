import type { DataSource } from "@/features/dashboard/types";
import type { AREAS } from "@/features/tasks/types";

export type LearningKind = "book" | "course" | "article" | "video" | "podcast" | "practice";
export type LearningStatus = "planned" | "in_progress" | "completed" | "dropped";

export type LearningItem = {
  id: string;
  goal_id: string | null;
  kind: LearningKind;
  title: string;
  author: string | null;
  url: string | null;
  status: LearningStatus;
  progress_pct: number | null;
  started_on: string | null;
  finished_on: string | null;
  notes: string | null;
  /** Reading: pages, and an uploaded file (kept privately in Storage; opened through /api/files/reading/[id]). */
  total_pages: number | null;
  current_page: number | null;
  file_name: string | null;
  file_size: number | null;
  file_type: string | null;
  source: DataSource;
};

export const LEARNING_ITEM_COLUMNS = "id, goal_id, kind, title, author, url, status, progress_pct, started_on, finished_on, notes, total_pages, current_page, file_name, file_size, file_type, source";

export type Skill = {
  id: string;
  name: string;
  area: (typeof AREAS)[number];
  level: number | null;
  target_level: number | null;
  notes: string | null;
  source: DataSource;
};

export type LearningStep = {
  id: string; position: number; title: string; is_exercise: boolean; learning_item_id: string | null; notes: string | null; done_at: string | null;
};

export type Roadmap = {
  id: string;
  title: string;
  description: string | null;
  goal_id: string | null;
  skill_id: string | null;
  target_date: string | null;
  /** Weekly study plan: weekdays (0 = Sunday), local time and minutes per session. */
  study_days: number[];
  study_time: string | null;
  study_minutes: number | null;
  archived_at: string | null;
  source: DataSource;
  steps: LearningStep[];
  /** The live study reminder, if one is set. */
  reminder: { id: string; remind_at: string; channels: string[] } | null;
};

export type StudySession = {
  id: string; studied_on: string; minutes: number; roadmap_id: string | null; learning_item_id: string | null; step_id: string | null; notes: string | null;
  /** Pages read in this session, when it was reading. */
  page_from: number | null; page_to: number | null;
  source: DataSource;
};

export const STUDY_SESSION_COLUMNS = "id, studied_on, minutes, roadmap_id, learning_item_id, step_id, notes, page_from, page_to, source";

export type LearningWorkspace = {
  items: LearningItem[];
  skills: Skill[];
  roadmaps: Roadmap[];
  /** Study sessions from the last few months, newest first. */
  sessions: StudySession[];
  goals: { id: string; title: string }[];
  today: string;
  timezone: string;
  locale: string;
  demo: boolean;
};

export const SESSION_HISTORY_DAYS = 120;

/** What the private `reading` bucket accepts (the bucket enforces the same list and size). */
export const BOOK_FILE_TYPES = ["application/pdf", "application/epub+zip", "text/plain", "text/markdown", "image/jpeg", "image/png", "image/webp"] as const;
export const MAX_BOOK_FILE_BYTES = 50 * 1024 * 1024;

export const LEARNING_KIND_LABEL: Record<LearningKind, string> = { book: "Book", course: "Course", article: "Article", video: "Video", podcast: "Podcast", practice: "Practice" };
export const LEARNING_STATUS_LABEL: Record<LearningStatus, string> = { planned: "Planned", in_progress: "In progress", completed: "Finished", dropped: "Dropped" };
export const SKILL_LEVEL_LABEL = ["", "Beginner", "Developing", "Capable", "Strong", "Expert"] as const;
