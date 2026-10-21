import "server-only";
import { localDateKey } from "@/lib/dates";
import { generateSampleSet } from "@/lib/sample-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AdminItem, AdminWorkspace, HomeRoutine } from "@/features/admin/types";
import { getViewer } from "./viewer";

const COLUMNS = "id, kind, title, category, due_on, repeat_months, remind_days_before, location, reference, notes, completed_at, source";

export async function getAdminWorkspace(now = new Date()): Promise<AdminWorkspace> {
  const viewer = await getViewer();
  const { timezone, locale } = viewer.profile;
  const today = localDateKey(now, timezone);

  if (viewer.mode === "demo") {
    const s = generateSampleSet(now, timezone, viewer.profile.baseCurrency);
    const tasks = s.tasks as unknown as { id: string; title: string; area: string; status: string; due_date?: string | null; recurrence_rule?: string | null }[];
    const routines = tasks.filter((t) => t.area === "home" && t.recurrence_rule && t.status !== "done").map((t) => ({ id: t.id, title: t.title, due_date: t.due_date ?? null, recurrence_rule: t.recurrence_rule! }));
    return { items: s.admin_items as AdminItem[], routines, today, locale, demo: true };
  }

  const supabase = await createSupabaseServerClient();
  const [items, routines] = await Promise.all([
    supabase.from("admin_items").select(COLUMNS).is("archived_at", null).order("due_on", { ascending: true, nullsFirst: false }).order("title").limit(1000),
    supabase.from("tasks").select("id, title, due_date, recurrence_rule").eq("area", "home").not("recurrence_rule", "is", null).in("status", ["todo", "in_progress", "waiting"]).is("parent_task_id", null).order("due_date").limit(100),
  ]);
  for (const r of [items, routines]) if (r.error) throw new Error(`Could not load home admin: ${r.error.message}`);
  return { items: (items.data ?? []) as AdminItem[], routines: (routines.data ?? []) as HomeRoutine[], today, locale, demo: false };
}
