import type { DataSource } from "@/features/dashboard/types";

export type WheelCategory = { id: string; name: string; description: string | null; sort_order: number; archived_at: string | null; source: DataSource };
export type WheelRating = { category_id: string; score: number; desired_score: number | null; note: string | null };
export type WheelAssessment = { id: string; assessed_on: string; note: string | null; source: DataSource; ratings: WheelRating[] };

export type WheelWorkspace = {
  categories: WheelCategory[];
  /** Newest first. */
  assessments: WheelAssessment[];
  goals: { id: string; title: string; wheel_category_id: string | null; status: string }[];
  today: string;
  locale: string;
  demo: boolean;
};

/** Offered (never auto-created) when someone starts with no categories. */
export const SUGGESTED_CATEGORIES = [
  "Health & fitness", "Mind & emotions", "Family & relationships", "Career & work", "Finances",
  "Learning & growth", "Spirituality & purpose", "Recreation & fun", "Home & environment", "Contribution",
];
