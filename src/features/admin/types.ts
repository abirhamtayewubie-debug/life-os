import type { DataSource } from "@/features/dashboard/types";

export type AdminKind = "renewal" | "document" | "chore" | "record";

export type AdminItem = {
  id: string;
  kind: AdminKind;
  title: string;
  category: string | null;
  due_on: string | null;
  repeat_months: number | null;
  remind_days_before: number;
  location: string | null;
  reference: string | null;
  notes: string | null;
  completed_at: string | null;
  source: DataSource;
};

export type HomeRoutine = { id: string; title: string; due_date: string | null; recurrence_rule: string };

export type AdminWorkspace = { items: AdminItem[]; routines: HomeRoutine[]; today: string; locale: string; demo: boolean };

export const ADMIN_KIND_LABEL: Record<AdminKind, string> = { renewal: "Renewal", document: "Document", chore: "One-off job", record: "Record" };
export const ADMIN_KIND_HINT: Record<AdminKind, string> = {
  renewal: "Insurance, licences, IDs, subscriptions: anything that expires.",
  document: "Where an important paper or file is kept.",
  chore: "A home job with a date, like a boiler service.",
  record: "Something that happened, like a repair, to look back on.",
};
