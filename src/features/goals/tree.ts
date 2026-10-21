import { LEVELS, type GoalLevel, type GoalRecord } from "./types";

export const levelRank = (l: GoalLevel) => LEVELS.indexOf(l);

export type GoalNode = GoalRecord & { children: GoalNode[]; depth: number };

/**
 * Nest goals under their parents. Goals whose parent is missing (deleted,
 * archived or filtered out) become roots so nothing silently disappears.
 */
export function buildTree(goals: GoalRecord[]): GoalNode[] {
  const byId = new Map<string, GoalNode>(goals.map((g) => [g.id, { ...g, children: [], depth: 0 }]));
  const roots: GoalNode[] = [];
  for (const n of byId.values()) {
    const parent = n.parent_id ? byId.get(n.parent_id) : undefined;
    if (parent && parent.id !== n.id) parent.children.push(n);
    else roots.push(n);
  }
  const order = (a: GoalNode, b: GoalNode) =>
    levelRank(a.level) - levelRank(b.level) || (a.target_date ?? "9999").localeCompare(b.target_date ?? "9999") || a.title.localeCompare(b.title);
  const seen = new Set<string>();
  const walk = (nodes: GoalNode[], depth: number) => {
    nodes.sort(order);
    for (const n of nodes) {
      if (seen.has(n.id)) continue; // defensive: the database refuses loops
      seen.add(n.id);
      n.depth = depth;
      walk(n.children, depth + 1);
    }
  };
  walk(roots, 0);
  return roots;
}

export function flatten(nodes: GoalNode[]): GoalNode[] {
  return nodes.flatMap((n) => [n, ...flatten(n.children)]);
}

/** Goals that may be this goal's parent: broader level, and not itself or a descendant. */
export function allowedParents(goal: Pick<GoalRecord, "id" | "level"> | null, level: GoalLevel, goals: GoalRecord[]): GoalRecord[] {
  const blocked = new Set<string>();
  if (goal) {
    blocked.add(goal.id);
    let grew = true;
    while (grew) {
      grew = false;
      for (const g of goals) if (g.parent_id && blocked.has(g.parent_id) && !blocked.has(g.id)) { blocked.add(g.id); grew = true; }
    }
  }
  return goals.filter((g) => !blocked.has(g.id) && levelRank(g.level) < levelRank(level) && g.status !== "abandoned");
}

/**
 * Percent toward a numeric target, or null when there is no measurable
 * target. Values are decimal strings; exactness doesn't matter for a bar,
 * but a missing or zero target must never produce a made-up number.
 */
export function metricPct(g: Pick<GoalRecord, "metric_target" | "metric_current">): number | null {
  if (g.metric_target === null || g.metric_current === null) return null;
  const t = Number(g.metric_target);
  const c = Number(g.metric_current);
  if (!Number.isFinite(t) || !Number.isFinite(c) || t <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((c / t) * 100)));
}

export function milestonePct(ms: { completed_at: string | null }[]): number | null {
  if (!ms.length) return null;
  return Math.round((ms.filter((m) => m.completed_at).length / ms.length) * 100);
}

/** Trim trailing zeros from a numeric(19,4) string: "76500.0000" → "76500". */
export function formatMetric(v: string | null, locale = "en-US"): string {
  if (v === null) return "–";
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(n);
}
