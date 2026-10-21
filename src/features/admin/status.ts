import { diffDays } from "@/lib/dates";
import type { AdminItem } from "./types";

export type DueStatus = "done" | "overdue" | "soon" | "later" | "none";

/** Only renewals and jobs have a due state; documents and records never nag. */
export function dueStatus(item: Pick<AdminItem, "kind" | "due_on" | "remind_days_before" | "completed_at">, todayKey: string): { status: DueStatus; inDays: number | null } {
  if (item.completed_at) return { status: "done", inDays: null };
  if (!item.due_on || item.kind === "document" || item.kind === "record") return { status: "none", inDays: null };
  const inDays = diffDays(todayKey, item.due_on);
  return { status: inDays < 0 ? "overdue" : inDays <= item.remind_days_before ? "soon" : "later", inDays };
}

/** Adds calendar months, clamping to the month's last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(dateKey: string, months: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}

/**
 * The next due date after renewing. It runs on from the old expiry date,
 * unless that still leaves it in the past (a late renewal), in which case
 * it runs from today.
 */
export function renewedDueDate(dueOn: string, repeatMonths: number, todayKey: string): string {
  const next = addMonths(dueOn, repeatMonths);
  return next > todayKey ? next : addMonths(todayKey, repeatMonths);
}
