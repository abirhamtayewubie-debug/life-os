import type { DataSource } from "@/features/dashboard/types";
import type { LearningItem, StudySession } from "@/features/learning/types";

export type JournalKind = "journal" | "gratitude" | "reflection" | "prayer" | "meditation" | "intention";

export type JournalEntry = {
  id: string;
  entry_date: string;
  kind: JournalKind;
  title: string | null;
  body: string;
  mood: number | null;
  is_private: boolean;
  /** Shared with the assistant (only possible when not private). */
  ai_access_allowed: boolean;
  source: DataSource;
  updated_at: string;
};

export type PersonalValue = { id: string; name: string; description: string | null; sort_order: number; source: DataSource };

export type MeditationLink = {
  id: string; title: string; url: string; minutes: number | null; category: string | null; notes: string | null; favourite: boolean; archived_at: string | null; source: DataSource;
};

export type MeditationSession = { id: string; practiced_on: string; minutes: number; link_id: string | null; notes: string | null; source: DataSource };

export type ReviewKind = "morning" | "evening" | "weekly" | "monthly";

/** A row of daily_reviews. Weekly and monthly reviews are dated on the period's first day. */
export type Review = {
  id: string;
  review_date: string;
  kind: ReviewKind;
  achievements: string | null;
  unfinished: string | null;
  tomorrow_priorities: string[];
  mood: number | null;
  energy: number | null;
  notes: string | null;
  source: DataSource;
};

export type ReflectionWorkspace = {
  entries: JournalEntry[];
  values: PersonalValue[];
  meditations: MeditationLink[];
  /** Practice from the last few months, newest first. */
  practice: MeditationSession[];
  /** Reviews from the last year or so, newest first. */
  reviews: Review[];
  /** Books and articles from Learning (the same records, not a copy). */
  books: LearningItem[];
  /** Study sessions with a book or article, from the last few months, newest first. */
  reading: StudySession[];
  goals: { id: string; title: string }[];
  query: string | null;
  today: string;
  /** First day of the week from the profile (0 = Sunday), shared with Reports. */
  weekStart: number;
  locale: string;
  demo: boolean;
};

export const PRACTICE_HISTORY_DAYS = 120;
export const REVIEW_HISTORY_DAYS = 400;

export const KIND_LABEL: Record<JournalKind, string> = {
  journal: "Journal", gratitude: "Gratitude", reflection: "Reflection", prayer: "Prayer", meditation: "Meditation", intention: "Intention",
};
export const KIND_PROMPT: Record<JournalKind, string> = {
  journal: "What's on your mind?",
  gratitude: "Three things you're grateful for today…",
  reflection: "What happened, and what did you learn?",
  prayer: "Your prayer or intentions…",
  meditation: "How was your practice? What did you notice?",
  intention: "What do you intend to bring to today?",
};
