import type { DataSource } from "@/features/dashboard/types";

export type NoteKind = "note" | "idea" | "meeting" | "learning" | "decision" | "reference" | "record";

export type NoteRecord = {
  id: string;
  title: string;
  body: string;
  kind: NoteKind;
  folder: string | null;
  url: string | null;
  pinned: boolean;
  project_id: string | null;
  goal_id: string | null;
  source: DataSource;
  updated_at: string;
  tags: string[];
};

export type NoteLink = { from_id: string; to_id: string };

export type KnowledgeWorkspace = {
  notes: NoteRecord[];
  /** Every note's id and title, even when a search narrows `notes`, so links resolve. */
  index: { id: string; title: string }[];
  links: NoteLink[];
  tags: string[];
  goals: { id: string; title: string }[];
  projects: { id: string; name: string }[];
  query: string | null;
  locale: string;
  timezone: string;
  demo: boolean;
};

export const NOTE_KIND_LABEL: Record<NoteKind, string> = {
  note: "Note", idea: "Idea", meeting: "Meeting", learning: "Learning", decision: "Decision", reference: "Reference", record: "Record",
};
