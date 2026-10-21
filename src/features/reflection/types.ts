import type { DataSource } from "@/features/dashboard/types";

export type JournalKind = "journal" | "gratitude" | "reflection" | "prayer" | "meditation" | "intention";

export type JournalEntry = {
  id: string;
  entry_date: string;
  kind: JournalKind;
  title: string | null;
  body: string;
  mood: number | null;
  is_private: boolean;
  source: DataSource;
  updated_at: string;
};

export type PersonalValue = { id: string; name: string; description: string | null; sort_order: number; source: DataSource };

export type ReflectionWorkspace = {
  entries: JournalEntry[];
  values: PersonalValue[];
  query: string | null;
  today: string;
  locale: string;
  demo: boolean;
};

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
