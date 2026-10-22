import "server-only";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { EXPORT_GROUPS, EXPORT_TABLES, type Row } from "@/features/export/tables";

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const PAGE = 1000;
/** Search indexes are derived from the text that is already exported. */
const DERIVED_COLUMNS = new Set(["search"]);
/** A stable order so pages never skip or repeat a row. */
const ORDER: Record<string, string[]> = {
  module_settings: ["module_key"],
  task_tags: ["task_id", "tag_id"],
  task_dependencies: ["task_id", "depends_on_task_id"],
  note_tags: ["note_id", "tag_id"],
  ai_settings: ["user_id"],
};

/**
 * Reads every row of one table that the caller owns, page by page. Runs on
 * the user-scoped client, so RLS is the boundary; the user_id filter is only
 * there to make that intent explicit.
 */
export async function readTable(supabase: Client, userId: string, table: string): Promise<Row[]> {
  const out: Row[] = [];
  const ownerColumn = table === "profiles" ? "id" : "user_id";
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select("*").eq(ownerColumn, userId);
    for (const col of ORDER[table] ?? ["created_at", "id"]) q = q.order(col, { ascending: true });
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw new Error(`Couldn't read ${table}: ${error.message}`);
    for (const r of data ?? []) {
      const row: Row = {};
      for (const [k, v] of Object.entries(r)) if (!DERIVED_COLUMNS.has(k)) row[k] = v;
      out.push(row);
    }
    if (!data || data.length < PAGE) return out;
  }
}

export type FullExport = {
  format: "life-os-export";
  version: 1;
  exportedAt: string;
  account: { id: string; email: string | null };
  groups: { key: string; label: string; tables: string[] }[];
  tables: Record<string, Row[]>;
  counts: Record<string, number>;
};

export async function buildExport(supabase: Client, userId: string, email: string | null): Promise<FullExport> {
  const tables: Record<string, Row[]> = {};
  // A few tables at a time keeps the database connection pool comfortable.
  for (let i = 0; i < EXPORT_TABLES.length; i += 6) {
    const batch = EXPORT_TABLES.slice(i, i + 6);
    const rows = await Promise.all(batch.map((t) => readTable(supabase, userId, t)));
    batch.forEach((t, j) => (tables[t] = rows[j]));
  }
  return {
    format: "life-os-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    account: { id: userId, email },
    groups: EXPORT_GROUPS,
    tables,
    counts: Object.fromEntries(Object.entries(tables).map(([t, r]) => [t, r.length])),
  };
}
