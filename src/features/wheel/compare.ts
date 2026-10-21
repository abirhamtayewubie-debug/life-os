import type { WheelAssessment, WheelCategory } from "./types";

export type CategoryRow = {
  id: string;
  name: string;
  score: number | null;
  desired: number | null;
  /** desired − score; null when either is missing. */
  gap: number | null;
  /** score − previous score for the same category; null if not rated both times. */
  change: number | null;
};

/**
 * Per-category comparison of the latest assessment with the one before it.
 * There is intentionally no overall score: the categories aren't commensurable.
 */
export function compareLatest(categories: WheelCategory[], assessments: WheelAssessment[]): CategoryRow[] {
  const [latest, previous] = assessments;
  return categories
    .filter((c) => !c.archived_at)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((c) => {
      const r = latest?.ratings.find((x) => x.category_id === c.id);
      const p = previous?.ratings.find((x) => x.category_id === c.id);
      const score = r?.score ?? null;
      const desired = r?.desired_score ?? null;
      return {
        id: c.id, name: c.name, score, desired,
        gap: score !== null && desired !== null ? desired - score : null,
        change: score !== null && p ? score - p.score : null,
      };
    });
}

/** Score history of one category, oldest first. */
export function categoryHistory(categoryId: string, assessments: WheelAssessment[]) {
  return [...assessments]
    .reverse()
    .flatMap((a) => {
      const r = a.ratings.find((x) => x.category_id === categoryId);
      return r ? [{ date: a.assessed_on, score: r.score, desired: r.desired_score }] : [];
    });
}

/** Days since the last assessment, for the gentle "time to reassess" nudge (quarterly ≈ 90 days). */
export function daysSince(assessments: WheelAssessment[], todayKey: string): number | null {
  const d = assessments[0]?.assessed_on;
  if (!d) return null;
  return Math.round((Date.parse(`${todayKey}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 86_400_000);
}
