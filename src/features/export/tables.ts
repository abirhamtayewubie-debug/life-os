import { toCsv } from "@/features/finance/csv";

/**
 * Everything a person owns, grouped the way the app presents it. The export
 * reads each table through the person's own session, so RLS decides what is
 * included. Left out on purpose: `integration_credentials` (secrets, never
 * readable), `currencies` (shared reference data) and the `account_balances`
 * view (derived from accounts and transactions, which are included).
 */
export const EXPORT_GROUPS: { key: string; label: string; tables: string[] }[] = [
  { key: "account", label: "Profile & settings", tables: ["profiles", "module_settings", "dashboard_widgets", "saved_views", "tags", "record_links", "audit_events"] },
  { key: "tasks", label: "Tasks & reminders", tables: ["tasks", "task_tags", "task_dependencies", "reminders", "reminder_deliveries"] },
  { key: "calendar", label: "Calendar", tables: ["calendar_events"] },
  { key: "habits", label: "Habits", tables: ["habits", "habit_logs"] },
  { key: "goals", label: "Goals", tables: ["goals", "goal_progress_entries", "milestones"] },
  { key: "work", label: "Work & projects", tables: ["projects", "time_entries"] },
  { key: "finance", label: "Finance", tables: ["financial_accounts", "transactions", "transaction_categories", "account_balance_snapshots", "budgets", "budget_lines", "recurring_transactions", "savings_goals", "personal_loans", "exchange_rates"] },
  { key: "health", label: "Health & sleep", tables: ["wellness_logs", "hydration_logs", "workouts", "workout_sets", "workout_programs", "program_exercises", "body_measurements", "sleep_logs"] },
  { key: "learning", label: "Learning", tables: ["learning_items", "skills", "learning_roadmaps", "learning_steps", "study_sessions"] },
  { key: "reflection", label: "Reflection", tables: ["journal_entries", "daily_reviews", "personal_values", "meditation_links", "meditation_sessions"] },
  { key: "relationships", label: "Relationships", tables: ["people", "important_dates", "interactions"] },
  { key: "admin", label: "Home & admin", tables: ["admin_items"] },
  { key: "knowledge", label: "Knowledge base", tables: ["notes", "note_tags"] },
  { key: "wheel", label: "Wheel of Life", tables: ["wheel_categories", "wheel_assessments", "wheel_ratings"] },
  { key: "reports", label: "Reports", tables: ["reports"] },
  { key: "assistant", label: "AI assistant", tables: ["ai_settings", "ai_conversations", "ai_messages", "ai_tool_calls", "ai_usage", "ai_briefings"] },
  { key: "integrations", label: "Integrations", tables: ["integrations", "push_subscriptions", "calendar_feeds"] },
];

export const EXPORT_TABLES: string[] = EXPORT_GROUPS.flatMap((g) => g.tables);

export function isExportTable(t: string): boolean {
  return EXPORT_TABLES.includes(t);
}

export type Row = Record<string, unknown>;

/** A table's rows as CSV. Columns are the union of keys in order of first appearance; objects and arrays become JSON. */
export function rowsToCsv(rows: Row[]): string {
  const cols: string[] = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
  const cell = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
  return toCsv([cols, ...rows.map((r) => cols.map((c) => cell(r[c])))]);
}

/* ---------------------------------------------------------------------------
 * A minimal ZIP writer (stored, no compression) so "everything as CSV" is one
 * download. Small on purpose: no dependency, UTF-8 names, CRC-32 checked.
 * ------------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zipStore(files: { name: string; data: Uint8Array }[], when = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const dosTime = (when.getUTCHours() << 11) | (when.getUTCMinutes() << 5) | Math.floor(when.getUTCSeconds() / 2);
  const dosDate = ((when.getUTCFullYear() - 1980) << 9) | ((when.getUTCMonth() + 1) << 5) | when.getUTCDate();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, f.data.length, true);
    local.setUint32(22, f.data.length, true);
    local.setUint16(26, name.length, true);
    locals.push(new Uint8Array(local.buffer), name, f.data);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, dosTime, true);
    central.setUint16(14, dosDate, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, f.data.length, true);
    central.setUint32(24, f.data.length, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, offset, true);
    centrals.push(new Uint8Array(central.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((n, b) => n + b.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
