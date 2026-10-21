import { addDays, diffDays, weekdayOf } from "@/lib/dates";
import { fromMinor, minorUnits, toMinor, type Money } from "@/lib/money";

/**
 * Pure finance arithmetic. Every amount is an integer of minor units
 * (bigint); rates are fixed-point with 10 decimals, as stored. Nothing here
 * converts between currencies without a rate the person entered, and every
 * converted figure carries the date of the rate it used.
 */

export type Rate = { base: string; quote: string; rate: string; as_of: string };

const RATE_SCALE = 10n ** 10n;

/** "56.25" → 562500000000n (10 decimals, as numeric(24,10)). */
export function parseRate(rate: string): bigint {
  const s = rate.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`Invalid rate: ${rate}`);
  const [int, frac = ""] = s.split(".");
  return BigInt(int + (frac + "0".repeat(10)).slice(0, 10));
}

/** Integer division rounding half away from zero. */
function divRound(n: bigint, d: bigint): bigint {
  const neg = (n < 0n) !== (d < 0n);
  const an = n < 0n ? -n : n;
  const ad = d < 0n ? -d : d;
  const q = (an * 2n + ad) / (ad * 2n);
  return neg ? -q : q;
}

/**
 * The newest rate on or before `onDate` for from→to, using the inverse pair
 * if that's what was entered. Returns null when there's none.
 */
export function findRate(rates: Rate[], from: string, to: string, onDate: string): { num: bigint; den: bigint; asOf: string } | null {
  let best: { num: bigint; den: bigint; asOf: string } | null = null;
  for (const r of rates) {
    if (r.as_of > onDate) continue;
    const direct = r.base === from && r.quote === to;
    const inverse = r.base === to && r.quote === from;
    if (!direct && !inverse) continue;
    if (best && best.asOf >= r.as_of) continue;
    const scaled = parseRate(r.rate);
    best = direct ? { num: scaled, den: RATE_SCALE, asOf: r.as_of } : { num: RATE_SCALE, den: scaled, asOf: r.as_of };
  }
  return best;
}

export type Converted = { money: Money; asOf: string | null };

/** Converts with the newest rate on or before `onDate`, or returns null. Same currency passes through. */
export function convertMoney(m: Money, to: string, rates: Rate[], onDate: string): Converted | null {
  if (m.currency === to) return { money: m, asOf: null };
  const r = findRate(rates, m.currency, to, onDate);
  if (!r) return null;
  const shift = minorUnits(to) - minorUnits(m.currency);
  let num = toMinor(m.amount, m.currency) * r.num;
  let den = r.den;
  if (shift > 0) num *= 10n ** BigInt(shift);
  if (shift < 0) den *= 10n ** BigInt(-shift);
  return { money: { amount: fromMinor(divRound(num, den), to), currency: to }, asOf: r.asOf };
}

const add = (a: Money, b: Money): Money => ({ amount: fromMinor(toMinor(a.amount, a.currency) + toMinor(b.amount, a.currency), a.currency), currency: a.currency });
export const zero = (currency: string): Money => ({ amount: fromMinor(0n, currency), currency });
export const negate = (m: Money): Money => ({ amount: fromMinor(-toMinor(m.amount, m.currency), m.currency), currency: m.currency });
export const absMoney = (m: Money): Money => (m.amount.startsWith("-") ? negate(m) : m);
export const isNegative = (m: Money) => toMinor(m.amount, m.currency) < 0n;
export const isZero = (m: Money) => toMinor(m.amount, m.currency) === 0n;
export const compareMoney = (a: Money, b: Money) => {
  const d = toMinor(a.amount, a.currency) - toMinor(b.amount, b.currency);
  return d < 0n ? -1 : d > 0n ? 1 : 0;
};
export function sumIn(currency: string, items: Money[]): Money {
  return items.reduce((acc, m) => add(acc, m), zero(currency));
}

/* ------------------------------------------------------------------------ */
/* Balances and net worth                                                   */
/* ------------------------------------------------------------------------ */

export type LedgerAccount = { id: string; name: string; currency: string; balance: string; is_liability: boolean; include_in_net_worth: boolean };

export type NetWorth = {
  base: string;
  /** Sum of everything that could be converted; null when nothing could. */
  total: Money | null;
  assets: Money;
  liabilities: Money;
  /** Currencies with balances but no rate to the base currency. */
  missing: { currency: string; amount: Money }[];
  /** Oldest rate date used, so the screen can say how current the total is. */
  oldestRate: string | null;
};

/** Liabilities are stored as negative balances (money owed), so they subtract on their own. */
export function netWorth(accounts: LedgerAccount[], base: string, rates: Rate[], today: string): NetWorth {
  let assets = zero(base);
  let liabilities = zero(base);
  const missing = new Map<string, Money>();
  let oldestRate: string | null = null;
  let converted = 0;
  for (const a of accounts) {
    if (!a.include_in_net_worth) continue;
    const m = { amount: a.balance, currency: a.currency };
    const c = convertMoney(m, base, rates, today);
    if (!c) {
      missing.set(a.currency, add(missing.get(a.currency) ?? zero(a.currency), m));
      continue;
    }
    converted++;
    if (c.asOf && (!oldestRate || c.asOf < oldestRate)) oldestRate = c.asOf;
    if (isNegative(c.money)) liabilities = add(liabilities, c.money);
    else assets = add(assets, c.money);
  }
  return {
    base,
    total: converted ? add(assets, liabilities) : null,
    assets,
    liabilities: absMoney(liabilities),
    missing: [...missing.entries()].map(([currency, amount]) => ({ currency, amount })),
    oldestRate,
  };
}

/* ------------------------------------------------------------------------ */
/* Periods and budgets                                                      */
/* ------------------------------------------------------------------------ */

export type Period = "weekly" | "monthly";

export function monthBounds(dayKey: string): { start: string; end: string } {
  const [y, m] = dayKey.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${dayKey.slice(0, 7)}-01`, end: `${dayKey.slice(0, 7)}-${String(last).padStart(2, "0")}` };
}

/** The budget period containing `dayKey`. weekStart: 0 = Sunday, 1 = Monday. */
export function periodBounds(period: Period, dayKey: string, weekStart = 1): { start: string; end: string } {
  if (period === "monthly") return monthBounds(dayKey);
  const start = addDays(dayKey, -((weekdayOf(dayKey) - weekStart + 7) % 7));
  return { start, end: addDays(start, 6) };
}

export function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export type LedgerTx = {
  id: string;
  account_id: string;
  category_id: string | null;
  kind: "income" | "expense" | "transfer" | "adjustment";
  amount: string;
  currency: string;
  occurred_on: string;
  is_pending?: boolean;
};

export type Category = { id: string; name: string; kind: "income" | "expense"; parent_id: string | null };

export type BudgetLineStatus = {
  categoryId: string;
  name: string;
  limit: Money;
  spent: Money;
  pct: number;
  remaining: Money;
  status: "ok" | "watch" | "over";
};

export type BudgetStatus = {
  start: string;
  end: string;
  pacePct: number;
  lines: BudgetLineStatus[];
  limit: Money;
  spent: Money;
  pct: number;
  /** Expenses in budgeted categories that couldn't be converted (no rate). */
  unconverted: { currency: string; amount: Money; count: number }[];
  /** Converted with a rate: how many, and the oldest rate date used. */
  convertedCount: number;
  oldestRate: string | null;
};

function pctOf(used: Money, limit: Money): number {
  const l = toMinor(limit.amount, limit.currency);
  if (l === 0n) return 0;
  return Number((toMinor(used.amount, used.currency) * 1000n) / l) / 10;
}

/**
 * Spending against each budget line for the period containing `today`.
 * Sub-category spending counts toward its parent's line unless the
 * sub-category has a line of its own. Pending transactions are left out.
 */
export function budgetStatus(
  budget: { period: Period; currency: string },
  lines: { category_id: string; amount: string }[],
  transactions: LedgerTx[],
  categories: Category[],
  rates: Rate[],
  today: string,
  weekStart = 1,
): BudgetStatus {
  const { start, end } = periodBounds(budget.period, today, weekStart);
  const cur = budget.currency;
  const lineFor = new Map<string, string>();
  const budgeted = new Set(lines.map((l) => l.category_id));
  for (const c of categories) {
    if (budgeted.has(c.id)) lineFor.set(c.id, c.id);
    else if (c.parent_id && budgeted.has(c.parent_id)) lineFor.set(c.id, c.parent_id);
  }
  const spentBy = new Map<string, Money>();
  const unconverted = new Map<string, { amount: Money; count: number }>();
  let convertedCount = 0;
  let oldestRate: string | null = null;
  for (const t of transactions) {
    if (t.kind !== "expense" || t.is_pending || !t.category_id || t.occurred_on < start || t.occurred_on > end) continue;
    const line = lineFor.get(t.category_id);
    if (!line) continue;
    const m = absMoney({ amount: t.amount, currency: t.currency });
    const c = convertMoney(m, cur, rates, t.occurred_on);
    if (!c) {
      const u = unconverted.get(t.currency) ?? { amount: zero(t.currency), count: 0 };
      unconverted.set(t.currency, { amount: add(u.amount, m), count: u.count + 1 });
      continue;
    }
    if (c.asOf) {
      convertedCount++;
      if (!oldestRate || c.asOf < oldestRate) oldestRate = c.asOf;
    }
    spentBy.set(line, add(spentBy.get(line) ?? zero(cur), c.money));
  }
  const total = diffDays(start, end) + 1;
  const elapsed = Math.min(total, Math.max(0, diffDays(start, today) + 1));
  const pacePct = Math.round((elapsed / total) * 100);
  const name = new Map(categories.map((c) => [c.id, c.name]));
  const out: BudgetLineStatus[] = lines.map((l) => {
    const limit = { amount: l.amount, currency: cur };
    const spent = spentBy.get(l.category_id) ?? zero(cur);
    const pct = pctOf(spent, limit);
    const remaining = { amount: fromMinor(toMinor(limit.amount, cur) - toMinor(spent.amount, cur), cur), currency: cur };
    return { categoryId: l.category_id, name: name.get(l.category_id) ?? "Removed category", limit, spent, pct, remaining, status: pct >= 100 ? "over" : pct > pacePct + 10 ? "watch" : "ok" };
  });
  const limit = sumIn(cur, out.map((l) => l.limit));
  const spent = sumIn(cur, out.map((l) => l.spent));
  return {
    start, end, pacePct, lines: out.sort((a, b) => b.pct - a.pct), limit, spent, pct: pctOf(spent, limit),
    unconverted: [...unconverted.entries()].map(([currency, v]) => ({ currency, ...v })),
    convertedCount, oldestRate,
  };
}

/* ------------------------------------------------------------------------ */
/* Monthly report                                                            */
/* ------------------------------------------------------------------------ */

export type CurrencyReport = {
  currency: string;
  income: Money;
  expenses: Money;
  net: Money;
  /** Share of income kept, in percent; null without income. */
  savingsRate: number | null;
  byCategory: { categoryId: string | null; name: string; kind: "income" | "expense"; amount: Money; previous: Money; change: Money }[];
  count: number;
};

/**
 * Income and spending for one month, one block per currency. Transfers and
 * adjustments are left out (they move money, they don't earn or spend it).
 * Sub-categories roll up to their parent.
 */
export function monthlyReport(transactions: LedgerTx[], categories: Category[], monthKey: string): CurrencyReport[] {
  const cats = new Map(categories.map((c) => [c.id, c]));
  const top = (id: string | null) => {
    const c = id ? cats.get(id) : undefined;
    return c?.parent_id ? cats.get(c.parent_id) ?? c : c;
  };
  const prevKey = shiftMonth(monthKey, -1);
  const blocks = new Map<string, { income: bigint; expenses: bigint; count: number; cat: Map<string, { name: string; kind: "income" | "expense"; now: bigint; prev: bigint }> }>();
  for (const t of transactions) {
    if (t.kind !== "income" && t.kind !== "expense") continue;
    if (t.is_pending) continue;
    const month = t.occurred_on.slice(0, 7);
    if (month !== monthKey && month !== prevKey) continue;
    const b = blocks.get(t.currency) ?? { income: 0n, expenses: 0n, count: 0, cat: new Map() };
    const v = toMinor(t.amount, t.currency);
    const c = top(t.category_id);
    const key = `${t.kind}:${c?.id ?? "none"}`;
    const row = b.cat.get(key) ?? { name: c?.name ?? "Uncategorised", kind: t.kind, now: 0n, prev: 0n };
    const abs = v < 0n ? -v : v;
    if (month === monthKey) {
      if (t.kind === "income") b.income += v;
      else b.expenses += -v;
      b.count++;
      row.now += abs;
    } else row.prev += abs;
    b.cat.set(key, row);
    blocks.set(t.currency, b);
  }
  return [...blocks.entries()]
    .filter(([, b]) => b.count > 0)
    .map(([currency, b]) => {
      const m = (v: bigint): Money => ({ amount: fromMinor(v, currency), currency });
      return {
        currency,
        income: m(b.income),
        expenses: m(b.expenses),
        net: m(b.income - b.expenses),
        savingsRate: b.income > 0n ? Number(((b.income - b.expenses) * 1000n) / b.income) / 10 : null,
        byCategory: [...b.cat.entries()]
          .map(([key, r]) => ({ categoryId: key.split(":")[1] === "none" ? null : key.split(":")[1], name: r.name, kind: r.kind, amount: m(r.now), previous: m(r.prev), change: m(r.now - r.prev) }))
          .filter((r) => r.amount.amount !== m(0n).amount || r.previous.amount !== m(0n).amount)
          .sort((x, y) => (x.kind === y.kind ? Number(toMinor(y.amount.amount, currency) - toMinor(x.amount.amount, currency)) : x.kind === "income" ? -1 : 1)),
        count: b.count,
      };
    })
    .sort((a, b) => b.count - a.count);
}

/* ------------------------------------------------------------------------ */
/* Bills, subscriptions, savings and debt                                    */
/* ------------------------------------------------------------------------ */

export type Unit = "week" | "month" | "year";

export function addMonthsClamped(dateKey: string, months: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}

export function nextDue(dateKey: string, every: number, unit: Unit): string {
  return unit === "week" ? addDays(dateKey, every * 7) : addMonthsClamped(dateKey, unit === "month" ? every : every * 12);
}

/** Average cost per month of a schedule (an estimate: weeks are averaged as 52/12 per month). */
export function monthlyEquivalent(amount: Money, every: number, unit: Unit): Money {
  const v = toMinor(amount.amount, amount.currency);
  const q = unit === "week" ? divRound(v * 52n, 12n * BigInt(every)) : unit === "month" ? divRound(v, BigInt(every)) : divRound(v, 12n * BigInt(every));
  return { amount: fromMinor(q, amount.currency), currency: amount.currency };
}

export type DueState = "overdue" | "today" | "soon" | "later";
export function dueState(nextDueOn: string, today: string, remindDaysBefore: number): { state: DueState; inDays: number } {
  const inDays = diffDays(today, nextDueOn);
  return { state: inDays < 0 ? "overdue" : inDays === 0 ? "today" : inDays <= remindDaysBefore ? "soon" : "later", inDays };
}

/** Percent saved toward a target (same currency), and the monthly amount still needed by the target date. */
export function savingsProgress(saved: Money, target: Money, today: string, targetDate: string | null): { pct: number; remaining: Money; perMonth: Money | null; monthsLeft: number | null } {
  const s = toMinor(saved.amount, saved.currency);
  const t = toMinor(target.amount, target.currency);
  const rem = t - s > 0n ? t - s : 0n;
  const pct = t > 0n ? Math.min(100, Number((s * 1000n) / t) / 10) : 0;
  let perMonth: Money | null = null;
  let monthsLeft: number | null = null;
  if (targetDate) {
    monthsLeft = Math.max(0, Math.ceil(diffDays(today, targetDate) / 30.4375));
    perMonth = monthsLeft > 0 ? { amount: fromMinor(divRound(rem, BigInt(monthsLeft)), target.currency), currency: target.currency } : null;
  }
  return { pct, remaining: { amount: fromMinor(rem, target.currency), currency: target.currency }, perMonth, monthsLeft };
}

/**
 * An estimate of how many months a fixed monthly payment takes to clear a
 * debt at a yearly interest rate (interest added monthly). Null when the
 * payment doesn't cover the interest, so the debt would never clear.
 */
export function payoffMonths(owed: Money, aprPct: number, payment: Money): { months: number; totalInterest: Money } | null {
  let bal = toMinor(owed.amount, owed.currency);
  const pay = toMinor(payment.amount, payment.currency);
  if (bal <= 0n) return { months: 0, totalInterest: zero(owed.currency) };
  if (pay <= 0n) return null;
  // monthly rate as a fraction with 1e8 precision
  const r = BigInt(Math.round((aprPct / 100 / 12) * 1e8));
  let interestTotal = 0n;
  for (let month = 1; month <= 1200; month++) {
    const interest = divRound(bal * r, 100_000_000n);
    if (interest >= pay) return null;
    interestTotal += interest;
    bal = bal + interest - pay;
    if (bal <= 0n) return { months: month, totalInterest: { amount: fromMinor(interestTotal, owed.currency), currency: owed.currency } };
  }
  return null;
}
