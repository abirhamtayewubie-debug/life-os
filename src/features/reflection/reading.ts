/**
 * Reading summaries. Books are Learning items and reading time is study
 * sessions with a book, so these only filter and add up what's already there.
 */
import type { LearningItem, StudySession } from "@/features/learning/types";

export const isReadable = (i: Pick<LearningItem, "kind">) => i.kind === "book" || i.kind === "article";

/** Pages in a session's range, when both ends were noted. */
export const pagesIn = (s: Pick<StudySession, "page_from" | "page_to">) => (s.page_from !== null && s.page_to !== null ? s.page_to - s.page_from + 1 : 0);

export const pagesBetween = (sessions: Pick<StudySession, "studied_on" | "page_from" | "page_to">[], from: string, to: string) =>
  sessions.filter((s) => s.studied_on >= from && s.studied_on <= to).reduce((a, s) => a + pagesIn(s), 0);

/** Percent through a book: from pages when known, otherwise the progress you set. */
export function bookPercent(i: Pick<LearningItem, "status" | "progress_pct" | "total_pages" | "current_page">): number {
  if (i.status === "completed") return 100;
  if (i.total_pages && i.current_page !== null) return Math.min(100, Math.round((i.current_page / i.total_pages) * 100));
  return i.progress_pct ?? 0;
}

/** The page to start the next session on. */
export const nextPage = (i: Pick<LearningItem, "current_page" | "total_pages">) =>
  i.current_page ? Math.min(i.current_page + 1, i.total_pages ?? Number.MAX_SAFE_INTEGER) : 1;

export const finishedIn = (items: Pick<LearningItem, "status" | "finished_on" | "kind">[], year: string) =>
  items.filter((i) => isReadable(i) && i.status === "completed" && i.finished_on?.startsWith(year)).length;
