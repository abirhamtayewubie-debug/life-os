import "server-only";
import { addDays, localDateKey } from "@/lib/dates";
import { fromMinor, toMinor } from "@/lib/money";
import { generateSampleSet } from "@/lib/sample-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { monthBounds, shiftMonth } from "@/features/finance/ledger";
import type { Account, Budget, Category, FinanceWorkspace, Recurring, SavingsGoal, StoredRate, Transaction, TxFilters } from "@/features/finance/types";
import { getViewer } from "./viewer";

const TX_COLUMNS = "id, account_id, category_id, recurring_id, project_id, kind, amount::text, currency, occurred_on, description, payee, notes, transfer_group_id, is_pending, source";
const LIST_LIMIT = 500;

const isMonth = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const isUuidLike = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export function readFilters(sp: Record<string, string | string[] | undefined>, today: string): TxFilters {
  return {
    month: isMonth(sp.month) ? sp.month : today.slice(0, 7),
    account: isUuidLike(sp.account) ? sp.account : undefined,
    category: typeof sp.category === "string" && (isUuidLike(sp.category) || sp.category === "none") ? sp.category : undefined,
    q: typeof sp.q === "string" && sp.q.trim() ? sp.q.trim().slice(0, 100) : undefined,
  };
}

function matches(t: Transaction, f: TxFilters) {
  if (t.occurred_on.slice(0, 7) !== f.month) return false;
  if (f.account && t.account_id !== f.account) return false;
  if (f.category === "none" ? t.category_id !== null || t.kind === "transfer" : f.category && t.category_id !== f.category) return false;
  if (f.q && !`${t.description ?? ""} ${t.payee ?? ""} ${t.notes ?? ""}`.toLowerCase().includes(f.q.toLowerCase())) return false;
  return true;
}

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

function filteredQuery(supabase: Client, filters: TxFilters) {
  const { start, end } = monthBounds(`${filters.month}-01`);
  let q = supabase.from("transactions").select(TX_COLUMNS).gte("occurred_on", start).lte("occurred_on", end);
  if (filters.account) q = q.eq("account_id", filters.account);
  if (filters.category === "none") q = q.is("category_id", null).neq("kind", "transfer");
  else if (filters.category) q = q.eq("category_id", filters.category);
  if (filters.q) {
    const p = `%${filters.q.replace(/[\\%_,()]/g, (c) => `\\${c}`)}%`;
    q = q.or(`description.ilike.${p},payee.ilike.${p},notes.ilike.${p}`);
  }
  return q;
}

export type ExportRow = { date: string; account: string; kind: string; amount: string; currency: string; category: string; description: string; payee: string; notes: string; pending: boolean; source: string };

/** Every transaction matching the Transactions tab's filters, for CSV export. */
export async function getFinanceExport(sp: Record<string, string | string[] | undefined>, now = new Date()): Promise<{ month: string; rows: ExportRow[] }> {
  const viewer = await getViewer();
  const filters = readFilters(sp, localDateKey(now, viewer.profile.timezone));
  let txs: Transaction[];
  let accounts: { id: string; name: string }[];
  let categories: { id: string; name: string; parent_id: string | null }[];
  if (viewer.mode === "demo") {
    const s = generateSampleSet(now, viewer.profile.timezone, viewer.profile.baseCurrency);
    txs = (s.transactions.map((t) => ({ payee: null, notes: null, is_pending: false, transfer_group_id: null, ...t })) as Transaction[]).filter((t) => matches(t, filters));
    accounts = s.financial_accounts;
    categories = s.transaction_categories;
  } else {
    const supabase = await createSupabaseServerClient();
    const [list, a, c] = await Promise.all([
      filteredQuery(supabase, filters).order("occurred_on").order("created_at").limit(20000),
      supabase.from("financial_accounts").select("id, name"),
      supabase.from("transaction_categories").select("id, name, parent_id"),
    ]);
    if (list.error || a.error || c.error) throw new Error("Could not load transactions for export");
    txs = list.data as Transaction[];
    accounts = a.data;
    categories = c.data;
  }
  const acc = new Map(accounts.map((a) => [a.id, a.name]));
  const cat = new Map(categories.map((c) => [c.id, c]));
  const catName = (id: string | null) => {
    const c = id ? cat.get(id) : undefined;
    if (!c) return "";
    const parent = c.parent_id ? cat.get(c.parent_id) : undefined;
    return parent ? `${parent.name} > ${c.name}` : c.name;
  };
  return {
    month: filters.month,
    rows: txs
      .sort((x, y) => x.occurred_on.localeCompare(y.occurred_on))
      .map((t) => ({ date: t.occurred_on, account: acc.get(t.account_id) ?? "", kind: t.kind, amount: t.amount, currency: t.currency, category: catName(t.category_id), description: t.description ?? "", payee: t.payee ?? "", notes: t.notes ?? "", pending: t.is_pending, source: t.source })),
  };
}

export async function getFinanceWorkspace(sp: Record<string, string | string[] | undefined>, now = new Date()): Promise<FinanceWorkspace> {
  const viewer = await getViewer();
  const { timezone, locale, baseCurrency } = viewer.profile;
  const today = localDateKey(now, timezone);
  const filters = readFilters(sp, today);
  const reportMonth = isMonth(sp.report) ? sp.report : today.slice(0, 7);
  // Budgets need this week/month; the report needs its month and the one before.
  const from = [shiftMonth(today.slice(0, 7), -1), shiftMonth(reportMonth, -1)].sort()[0] + "-01";
  const to = [today, monthBounds(`${reportMonth}-01`).end].sort().at(-1)!;
  const recentFrom = from < addDays(today, -6) ? from : addDays(today, -6);

  if (viewer.mode === "demo") {
    const s = generateSampleSet(now, timezone, baseCurrency);
    const txs = s.transactions.map((t) => ({ recurring_id: null, project_id: null, payee: null, notes: null, transfer_group_id: null, is_pending: false, ...t })) as Transaction[];
    const accounts = s.financial_accounts.map((a) => {
      let v = toMinor(a.opening_balance, a.currency);
      for (const t of txs) if (t.account_id === a.id) v += toMinor(t.amount, a.currency);
      return { institution: null, interest_rate: null, include_in_net_worth: true, archived_at: null, is_liability: false, ...a, balance: fromMinor(v, a.currency), last_transaction_on: txs.filter((t) => t.account_id === a.id).map((t) => t.occurred_on).sort().at(-1) ?? null };
    }) as Account[];
    const list = txs.filter((t) => matches(t, filters)).sort((a, b) => b.occurred_on.localeCompare(a.occurred_on));
    return {
      accounts,
      categories: s.transaction_categories.map((c) => ({ ...c, archived_at: null })) as Category[],
      list, listTruncated: false,
      recent: txs.filter((t) => t.occurred_on >= recentFrom && t.occurred_on <= to),
      recurring: s.recurring_transactions.map((r) => ({ ends_on: null, ...r })) as Recurring[],
      budgets: s.budgets.map((b) => ({ ends_on: null, ...b, lines: s.budget_lines.filter((l) => l.budget_id === b.id) })) as Budget[],
      rates: s.exchange_rates as StoredRate[],
      savings: s.savings_goals as SavingsGoal[],
      projects: s.projects.map(({ id, name }) => ({ id, name })),
      goals: s.goals.map(({ id, title }) => ({ id, title })),
      currencies: ["AED", "CAD", "ETB", "EUR", "GBP", "KES", "USD"],
      baseCurrency, weekStart: 1, filters, reportMonth, today, locale, demo: true,
    };
  }

  const supabase = await createSupabaseServerClient();
  const listQ = filteredQuery(supabase, filters);

  const [accounts, balances, categories, list, recent, recurring, budgets, rates, savings, projects, goals, currencies, profile] = await Promise.all([
    supabase.from("financial_accounts").select("id, name, kind, currency, institution, opening_balance::text, opening_date, is_liability, interest_rate::text, include_in_net_worth, source, archived_at").order("name"),
    supabase.from("account_balances").select("account_id, balance::text, last_transaction_on"),
    supabase.from("transaction_categories").select("id, parent_id, kind, name, archived_at, source").order("name"),
    listQ.order("occurred_on", { ascending: false }).order("created_at", { ascending: false }).limit(LIST_LIMIT + 1),
    supabase.from("transactions").select(TX_COLUMNS).gte("occurred_on", recentFrom).lte("occurred_on", to).limit(20000),
    supabase.from("recurring_transactions").select("id, account_id, category_id, currency, description, amount::text, every_n, unit, next_due_on, ends_on, is_bill, is_subscription, remind_days_before, autopay, source").is("archived_at", null).order("next_due_on"),
    supabase.from("budgets").select("id, name, period, currency, starts_on, ends_on, source, budget_lines(id, category_id, amount::text)").is("archived_at", null).order("created_at"),
    supabase.from("exchange_rates").select("id, base, quote, rate::text, as_of, source").order("as_of", { ascending: false }).limit(2000),
    supabase.from("savings_goals").select("id, goal_id, account_id, name, target_amount::text, currency, saved_amount::text, target_date, source").is("archived_at", null).order("created_at"),
    supabase.from("projects").select("id, name").is("archived_at", null).order("name"),
    supabase.from("goals").select("id, title").in("status", ["active", "paused"]).order("title"),
    supabase.from("currencies").select("code").order("code"),
    supabase.from("profiles").select("week_starts_on").eq("id", viewer.userId).maybeSingle(),
  ]);
  for (const r of [accounts, balances, categories, list, recent, recurring, budgets, rates, savings, projects, goals, currencies]) if (r.error) throw new Error(`Could not load finance: ${r.error.message}`);

  const bal = new Map((balances.data ?? []).map((b) => [b.account_id, b]));
  const rows = (list.data ?? []) as Transaction[];
  return {
    accounts: (accounts.data ?? []).map((a) => ({
      ...a,
      // Archived accounts aren't in the balance view; their ledger is frozen at the opening balance plus history.
      balance: bal.get(a.id)?.balance ?? a.opening_balance,
      last_transaction_on: bal.get(a.id)?.last_transaction_on ?? null,
    })) as Account[],
    categories: (categories.data ?? []) as Category[],
    list: rows.slice(0, LIST_LIMIT),
    listTruncated: rows.length > LIST_LIMIT,
    recent: (recent.data ?? []) as Transaction[],
    recurring: (recurring.data ?? []) as Recurring[],
    budgets: (budgets.data ?? []).map(({ budget_lines, ...b }) => ({ ...b, lines: budget_lines ?? [] })) as Budget[],
    rates: (rates.data ?? []) as StoredRate[],
    savings: (savings.data ?? []) as SavingsGoal[],
    projects: projects.data ?? [],
    goals: goals.data ?? [],
    currencies: (currencies.data ?? []).map((c) => c.code),
    baseCurrency, weekStart: profile.data?.week_starts_on ?? 1, filters, reportMonth, today, locale, demo: false,
  };
}
