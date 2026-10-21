import type { DataSource } from "@/features/dashboard/types";

export type InteractionKind = "call" | "message" | "visit" | "meal" | "event" | "other";
export type ImportantDateKind = "birthday" | "anniversary" | "memorial" | "renewal" | "other";

export type Person = {
  id: string;
  name: string;
  relationship: string | null;
  birthday: string | null;
  notes: string | null;
  contact_every_days: number | null;
  last_contacted_on: string | null;
  source: DataSource;
};

export type Interaction = { id: string; person_id: string; occurred_on: string; kind: InteractionKind; note: string | null; source: DataSource };

export type ImportantDate = {
  id: string;
  person_id: string | null;
  kind: ImportantDateKind;
  title: string;
  date: string;
  recurs_yearly: boolean;
  remind_days_before: number;
  source: DataSource;
};

export type RelationshipsWorkspace = {
  people: Person[];
  interactions: Interaction[];
  dates: ImportantDate[];
  today: string;
  locale: string;
  demo: boolean;
};

export const INTERACTION_LABEL: Record<InteractionKind, string> = { call: "Call", message: "Message", visit: "Visit", meal: "Meal together", event: "Event", other: "Other" };
export const DATE_KIND_LABEL: Record<ImportantDateKind, string> = { birthday: "Birthday", anniversary: "Anniversary", memorial: "Memorial", renewal: "Renewal", other: "Other" };
