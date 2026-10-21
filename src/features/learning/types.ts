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
  source: DataSource;
};

export type Skill = {
  id: string;
  name: string;
  area: (typeof AREAS)[number];
  level: number | null;
  target_level: number | null;
  notes: string | null;
  source: DataSource;
};

export type LearningWorkspace = {
  items: LearningItem[];
  skills: Skill[];
  goals: { id: string; title: string }[];
  today: string;
  locale: string;
  demo: boolean;
};

export const LEARNING_KIND_LABEL: Record<LearningKind, string> = { book: "Book", course: "Course", article: "Article", video: "Video", podcast: "Podcast", practice: "Practice" };
export const LEARNING_STATUS_LABEL: Record<LearningStatus, string> = { planned: "Planned", in_progress: "In progress", completed: "Finished", dropped: "Dropped" };
export const SKILL_LEVEL_LABEL = ["", "Beginner", "Developing", "Capable", "Strong", "Expert"] as const;
