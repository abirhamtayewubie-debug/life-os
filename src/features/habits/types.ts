import type { RawHabit, RawHabitLog } from "@/features/dashboard/types";

export type HabitRecord = RawHabit & {
  description: string | null;
  archived_at: string | null;
};

export type HabitWorkspace = {
  habits: HabitRecord[];
  logs: RawHabitLog[];
  /** First date covered by `logs`. */
  logsFrom: string;
  today: string;
  timezone: string;
  locale: string;
  demo: boolean;
};

export const TIME_OF_DAY_LABEL = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", anytime: "Any time" } as const;
export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
