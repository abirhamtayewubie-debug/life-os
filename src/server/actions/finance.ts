"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { localDateKey } from "@/lib/dates";
import { fromMinor, minorUnits, toMinor } from "@/lib/money";
import { nextDue } from "@/features/finance/ledger";
import { DEFAULT_CATEGORIES, LIABILITY_KINDS } from "@/features/finance/types";
import { DEMO_RESULT, type ActionResult } from "./result";
import { audit, liveContext } from "./guard";
import { dateKey, invalid, isUuid, optionalDate, optionalText, optionalUuid } from "./validation";

type Ctx = NonNullable<Awaited<ReturnType<typeof liveContext>>>;

function refresh() {
  revalidatePath("/finance");
  revalidatePath("/");
  revalidatePath("/work");
}

/** A positive decimal with at most 15 integer digits and 4 decimals; currency precision is checked separately. */
const amountText = z.string().trim().regex(/^\d{1,15}(\.\d{1,4})?$/, "Use an amount like 1200 or 1200.50");
const signedAmountText = z.string().trim().regex(/^-?\d{1,15}(\.\d{1,4})?$/, "Use an amount like 1200 or -1200.50");

/** Rejects more decimals than the currency has (e.g. 0.001 ETB), then normalises. */
function money(amount: string, currency: string): string | null {
  const frac = amount.replace(/^-/, "").split(".")[1] ?? "";
  if (frac.replace(/0+$/, "").length > minorUnits(currency)) return null;
  return fromMinor(toMinor(amount, currency), currency);
}

const precisionError = (field: string, currency: string): ActionResult<never> => ({
  ok: false, error: `${currency} has ${minorUnits(currency)} decimal places.`, fieldErrors: { [field]: [`${currency} has ${minorUnits(currency)} decimal places.`] },
});

async function accountCurrency(ctx: Ctx, accountId: string): Promise<string | null> {
  const { data } = await ctx.supabase.from("financial_accounts").select("currency").eq("id", accountId).is("archived_at", null).maybeSingle();
  return data?.currency ?? null;
}

const today = (ctx: Ctx) => localDateKey(new Date(), ctx.viewer.profile.timezone);

/* ------------------------------------------------------------------------ */
/* Accounts                                                                  */
/* ------------------------------------------------------------------------ */

const accountSchema = z.object({
  name: z.string().trim().min(1, "Name the account").max(120),
  kind: z.enum(["cash", "checking", "savings", "credit_card", "loan", "investment", "mobile_money", "other"]),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Pick a currency"),
  institution: optionalText(120),
  /** For a card or loan this is the amount owed, entered as a positive number. */
  openingBalance: signedAmountText.or(z.literal("")).default(""),
  openingDate: dateKey,
  interestRate: z.union([z.literal(""), z.coerce.number().min(0, "Use 0 to 100").max(100, "Use 0 to 100")]).optional().transform((v) => (v === "" || v === undefined ? null : v)),
  includeInNetWorth: z.boolean().default(true),
});

export type AccountInput = z.input<typeof accountSchema>;

export async function saveAccount(id: string | null, input: AccountInput): Promise<ActionResult<{ id: string }>> {
  if (id !== null && !isUuid(id)) return { ok: false, error: "Invalid account." };
  const parsed = accountSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const v = parsed.data;
  if (v.openingDate > today(ctx)) return { ok: false, error: "The starting date can't be in the future.", fieldErrors: { openingDate: ["The starting date can't be in the future."] } };
  const raw = v.openingBalance || "0";
  const liability = LIABILITY_KINDS.includes(v.kind);
  if (liability && raw.startsWith("-")) return { ok: false, error: "Enter what you owe as a positive amount.", fieldErrors: { openingBalance: ["Enter what you owe as a positive amount."] } };
  const opening = money(raw, v.currency);
  if (opening === null) return precisionError("openingBalance", v.currency);
  const row = {
    name: v.name, kind: v.kind, currency: v.currency, institution: v.institution, opening_date: v.openingDate,
    // Money owed is stored as a negative balance, so totals subtract it without special cases.
    opening_balance: liability && opening !== fromMinor(0n, v.currency) ? `-${opening}` : opening,
    interest_rate: v.interestRate, include_in_net_worth: v.includeInNetWorth,
  };
  if (id) {
    const { data, error } = await ctx.supabase.from("financial_accounts").update(row).eq("id", id).select("id");
    if (error) {
      if (error.code === "23503") return { ok: false, error: "This account has transactions, so its currency can't change. Create a new account instead.", fieldErrors: { currency: ["Can't change: the account has transactions."] } };
      return { ok: false, error: "Couldn't save the account." };
    }
    if (!data?.length) return { ok: false, error: "Account not found." };
    refresh();
    return { ok: true, data: { id }, message: "Saved." };
  }
  const { data, error } = await ctx.supabase.from("financial_accounts").insert({ ...row, user_id: ctx.viewer.userId, source: "manual" }).select("id").single();
  if (error) return { ok: false, error: "Couldn't save the account." };
  refresh();
  return { ok: true, data: { id: data.id }, message: `${v.name} added.` };
}

export async function setAccountArchived(id: string, archived: boolean): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid account." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data, error } = await ctx.supabase.from("financial_accounts").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", id).select("id");
  if (error) return { ok: false, error: "Couldn't update the account." };
  if (!data?.length) return { ok: false, error: "Account not found." };
  refresh();
  return { ok: true, message: archived ? "Account closed. Its history is kept." : "Account reopened." };
}

/** Deletes the account and every transaction in it. The screen asks first and says how many. */
export async function deleteAccount(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid account." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { count } = await ctx.supabase.from("transactions").select("id", { count: "exact", head: true }).eq("account_id", id);
  const { data, error } = await ctx.supabase.from("financial_accounts").delete().eq("id", id).select("id, name");
  if (error) return { ok: false, error: "Couldn't delete the account." };
  if (!data?.length) return { ok: false, error: "Account not found." };
  await audit(ctx, "account.deleted", { type: "financial_account", id }, { name: data[0].name, transactions: count ?? 0 });
  refresh();
  return { ok: true, message: "Account deleted." };
}

/* ------------------------------------------------------------------------ */
/* Transactions                                                              */
/* ------------------------------------------------------------------------ */

const txSchema = z.object({
  accountId: z.uuid("Pick an account"),
  kind: z.enum(["income", "expense", "adjustment"]),
  /** Positive for income and expense (the kind sets the sign); signed for an adjustment. */
  amount: signedAmountText,
  date: dateKey,
  categoryId: optionalUuid,
  projectId: optionalUuid,
  description: optionalText(300),
  payee: optionalText(200),
  notes: optionalText(2000),
  pending: z.boolean().default(false),
});

export type TransactionInput = z.input<typeof txSchema>;

export async function saveTransaction(id: string | null, input: TransactionInput): Promise<ActionResult<{ id: string }>> {
  if (id !== null && !isUuid(id)) return { ok: false, error: "Invalid transaction." };
  const parsed = txSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const v = parsed.data;
  if (v.kind !== "adjustment" && v.amount.startsWith("-")) return { ok: false, error: "Enter a positive amount; the type sets the direction.", fieldErrors: { amount: ["Enter a positive amount."] } };
  const currency = await accountCurrency(ctx, v.accountId);
  if (!currency) return { ok: false, error: "Pick an open account.", fieldErrors: { accountId: ["Pick an open account."] } };
  const amt = money(v.amount, currency);
  if (amt === null) return precisionError("amount", currency);
  if (toMinor(amt, currency) === 0n) return { ok: false, error: "The amount can't be zero.", fieldErrors: { amount: ["The amount can't be zero."] } };
  if (v.date > today(ctx) && !v.pending) return { ok: false, error: "Future-dated transactions must be marked pending.", fieldErrors: { date: ["Mark it pending, or pick today or earlier."] } };
  const row = {
    account_id: v.accountId, kind: v.kind, currency, occurred_on: v.date,
    amount: v.kind === "expense" ? `-${amt}` : amt,
    category_id: v.kind === "adjustment" ? null : v.categoryId,
    project_id: v.projectId, description: v.description, payee: v.payee, notes: v.notes, is_pending: v.pending,
  };
  const fail = (code?: string): ActionResult<never> =>
    code === "23514" ? { ok: false, error: "That category is for the other direction (income vs spending).", fieldErrors: { categoryId: ["Pick a matching category."] } } : { ok: false, error: "Couldn't save the transaction." };
  if (id) {
    const { data: cur } = await ctx.supabase.from("transactions").select("kind").eq("id", id).maybeSingle();
    if (!cur) return { ok: false, error: "Transaction not found." };
    if (cur.kind === "transfer") return { ok: false, error: "Transfers can't be edited here. Delete it and record it again." };
    const { error } = await ctx.supabase.from("transactions").update(row).eq("id", id);
    if (error) return fail(error.code);
    refresh();
    return { ok: true, data: { id }, message: "Saved." };
  }
  const { data, error } = await ctx.supabase.from("transactions").insert({ ...row, user_id: ctx.viewer.userId, source: "manual" }).select("id").single();
  if (error) return fail(error.code);
  refresh();
  return { ok: true, data: { id: data.id }, message: "Transaction added." };
}

export async function deleteTransaction(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid transaction." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data, error } = await ctx.supabase.from("transactions").delete().eq("id", id).select("id, kind, amount::text, currency, occurred_on");
  if (error) return { ok: false, error: "Couldn't delete the transaction." };
  if (!data?.length) return { ok: false, error: "Transaction not found." };
  await audit(ctx, "transaction.deleted", { type: "transaction", id }, { kind: data[0].kind, amount: data[0].amount, currency: data[0].currency, occurred_on: data[0].occurred_on });
  refresh();
  return { ok: true, message: data[0].kind === "transfer" ? "Transfer deleted (both sides)." : "Transaction deleted." };
}

const transferSchema = z.object({
  fromAccountId: z.uuid("Pick an account"),
  toAccountId: z.uuid("Pick an account"),
  fromAmount: amountText,
  /** Only for transfers between currencies; otherwise the same as fromAmount. */
  toAmount: amountText.or(z.literal("")).default(""),
  date: dateKey,
  description: optionalText(300),
}).refine((v) => v.fromAccountId !== v.toAccountId, { path: ["toAccountId"], message: "Pick a different account" });

export type TransferInput = z.input<typeof transferSchema>;

export async function createTransfer(input: TransferInput): Promise<ActionResult> {
  const parsed = transferSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const v = parsed.data;
  if (v.date > today(ctx)) return { ok: false, error: "Pick today or an earlier date.", fieldErrors: { date: ["Pick today or an earlier date."] } };
  const [fromCur, toCur] = await Promise.all([accountCurrency(ctx, v.fromAccountId), accountCurrency(ctx, v.toAccountId)]);
  if (!fromCur || !toCur) return { ok: false, error: "Pick two open accounts." };
  const fromAmt = money(v.fromAmount, fromCur);
  if (fromAmt === null) return precisionError("fromAmount", fromCur);
  let toAmt = fromAmt;
  if (fromCur !== toCur) {
    if (!v.toAmount) return { ok: false, error: `Enter how much arrived in ${toCur}.`, fieldErrors: { toAmount: [`How much arrived in ${toCur}?`] } };
    const t = money(v.toAmount, toCur);
    if (t === null) return precisionError("toAmount", toCur);
    toAmt = t;
  }
  if (toMinor(fromAmt, fromCur) === 0n || toMinor(toAmt, toCur) === 0n) return { ok: false, error: "Amounts can't be zero." };
  const { error } = await ctx.supabase.rpc("create_transfer", {
    p_from_account: v.fromAccountId, p_to_account: v.toAccountId, p_from_amount: fromAmt, p_to_amount: toAmt, p_occurred_on: v.date, p_description: v.description,
  });
  if (error) return { ok: false, error: error.code === "23514" ? error.message : "Couldn't record the transfer." };
  refresh();
  return { ok: true, message: "Transfer recorded." };
}

/* ------------------------------------------------------------------------ */
/* Categories                                                                */
/* ------------------------------------------------------------------------ */

const categorySchema = z.object({
  name: z.string().trim().min(1, "Name the category").max(80),
  kind: z.enum(["income", "expense"]),
  parentId: optionalUuid,
});

export async function saveCategory(id: string | null, input: z.input<typeof categorySchema>): Promise<ActionResult<{ id: string }>> {
  if (id !== null && !isUuid(id)) return { ok: false, error: "Invalid category." };
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const v = parsed.data;
  if (id && v.parentId === id) return { ok: false, error: "A category can't sit under itself." };
  const row = { name: v.name, kind: v.kind, parent_id: v.parentId };
  const res = id
    ? await ctx.supabase.from("transaction_categories").update(row).eq("id", id).select("id").single()
    : await ctx.supabase.from("transaction_categories").insert({ ...row, user_id: ctx.viewer.userId, source: "manual" }).select("id").single();
  if (res.error) {
    if (res.error.code === "23505") return { ok: false, error: "You already have a category with that name.", fieldErrors: { name: ["Already exists."] } };
    if (res.error.code === "23514") return { ok: false, error: res.error.message };
    return { ok: false, error: "Couldn't save the category." };
  }
  refresh();
  return { ok: true, data: { id: res.data.id }, message: "Saved." };
}

/** Transactions in it become uncategorised; its budget lines and sub-categories go with it. */
export async function deleteCategory(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid category." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { error } = await ctx.supabase.from("transaction_categories").delete().eq("id", id);
  if (error) return { ok: false, error: "Couldn't delete the category." };
  refresh();
  return { ok: true, message: "Category deleted. Its transactions are now uncategorised." };
}

export async function addDefaultCategories(): Promise<ActionResult> {
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data: existing } = await ctx.supabase.from("transaction_categories").select("kind, name").is("parent_id", null);
  const have = new Set((existing ?? []).map((c) => `${c.kind}:${c.name.toLowerCase()}`));
  const rows = DEFAULT_CATEGORIES.filter((c) => !have.has(`${c.kind}:${c.name.toLowerCase()}`)).map((c) => ({ ...c, user_id: ctx.viewer.userId, source: "manual" as const }));
  if (rows.length) {
    const { error } = await ctx.supabase.from("transaction_categories").insert(rows);
    if (error) return { ok: false, error: "Couldn't add the categories." };
  }
  refresh();
  return { ok: true, message: rows.length ? `Added ${rows.length} categories. Rename or remove any of them.` : "You already have these categories." };
}

/* ------------------------------------------------------------------------ */
/* Budgets                                                                   */
/* ------------------------------------------------------------------------ */

const budgetSchema = z.object({
  name: z.string().trim().min(1, "Name the budget").max(120),
  period: z.enum(["weekly", "monthly"]),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Pick a currency"),
  lines: z.array(z.object({ categoryId: z.uuid(), amount: amountText.or(z.literal("")) })).max(200),
});

export type BudgetInput = z.input<typeof budgetSchema>;

export async function saveBudget(id: string | null, input: BudgetInput): Promise<ActionResult<{ id: string }>> {
  if (id !== null && !isUuid(id)) return { ok: false, error: "Invalid budget." };
  const parsed = budgetSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const v = parsed.data;
  const lines: { category_id: string; amount: string }[] = [];
  for (const l of v.lines) {
    if (!l.amount) continue;
    const a = money(l.amount, v.currency);
    if (a === null) return precisionError("lines", v.currency);
    if (toMinor(a, v.currency) > 0n) lines.push({ category_id: l.categoryId, amount: a });
  }
  if (!lines.length) return { ok: false, error: "Set an amount for at least one category.", fieldErrors: { lines: ["Set at least one amount."] } };
  if (new Set(lines.map((l) => l.category_id)).size !== lines.length) return { ok: false, error: "Each category can appear once." };

  let budgetId = id;
  const row = { name: v.name, period: v.period, currency: v.currency };
  if (id) {
    const { data, error } = await ctx.supabase.from("budgets").update(row).eq("id", id).select("id");
    if (error || !data?.length) return { ok: false, error: "Couldn't save the budget." };
  } else {
    const { data, error } = await ctx.supabase.from("budgets").insert({ ...row, starts_on: today(ctx), user_id: ctx.viewer.userId, source: "manual" }).select("id").single();
    if (error) return { ok: false, error: "Couldn't save the budget." };
    budgetId = data.id;
  }
  const del = await ctx.supabase.from("budget_lines").delete().eq("budget_id", budgetId!);
  if (del.error) return { ok: false, error: "Couldn't update the budget lines." };
  const { error } = await ctx.supabase.from("budget_lines").insert(lines.map((l) => ({ ...l, budget_id: budgetId!, user_id: ctx.viewer.userId })));
  if (error) return { ok: false, error: error.code === "23514" ? "Budgets cover spending categories only." : "Couldn't save the budget lines." };
  refresh();
  return { ok: true, data: { id: budgetId! }, message: "Budget saved." };
}

export async function deleteBudget(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid budget." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { error } = await ctx.supabase.from("budgets").delete().eq("id", id);
  if (error) return { ok: false, error: "Couldn't delete the budget." };
  refresh();
  return { ok: true, message: "Budget deleted. Your transactions are untouched." };
}

/* ------------------------------------------------------------------------ */
/* Bills, subscriptions and regular income                                   */
/* ------------------------------------------------------------------------ */

const recurringSchema = z.object({
  accountId: z.uuid("Pick an account"),
  categoryId: optionalUuid,
  description: z.string().trim().min(1, "Describe it").max(200),
  amount: amountText,
  kind: z.enum(["bill", "subscription", "income", "other_out"]),
  everyN: z.coerce.number().int().min(1, "Use 1 to 24").max(24, "Use 1 to 24"),
  unit: z.enum(["week", "month", "year"]),
  nextDueOn: dateKey,
  endsOn: optionalDate,
  remindDaysBefore: z.coerce.number().int().min(0, "Use 0 to 30").max(30, "Use 0 to 30").default(2),
  autopay: z.boolean().default(false),
}).refine((v) => !v.endsOn || v.endsOn >= v.nextDueOn, { path: ["endsOn"], message: "Ends before it's next due" });

export type RecurringInput = z.input<typeof recurringSchema>;

export async function saveRecurring(id: string | null, input: RecurringInput): Promise<ActionResult> {
  if (id !== null && !isUuid(id)) return { ok: false, error: "Invalid item." };
  const parsed = recurringSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const v = parsed.data;
  const currency = await accountCurrency(ctx, v.accountId);
  if (!currency) return { ok: false, error: "Pick an open account.", fieldErrors: { accountId: ["Pick an open account."] } };
  const amt = money(v.amount, currency);
  if (amt === null) return precisionError("amount", currency);
  if (toMinor(amt, currency) === 0n) return { ok: false, error: "The amount can't be zero.", fieldErrors: { amount: ["Can't be zero."] } };
  const row = {
    account_id: v.accountId, category_id: v.categoryId, currency, description: v.description,
    amount: v.kind === "income" ? amt : `-${amt}`,
    is_bill: v.kind === "bill", is_subscription: v.kind === "subscription",
    every_n: v.everyN, unit: v.unit, next_due_on: v.nextDueOn, ends_on: v.endsOn, remind_days_before: v.remindDaysBefore, autopay: v.autopay,
  };
  const { error } = id
    ? await ctx.supabase.from("recurring_transactions").update(row).eq("id", id)
    : await ctx.supabase.from("recurring_transactions").insert({ ...row, user_id: ctx.viewer.userId, source: "manual" });
  if (error) return { ok: false, error: "Couldn't save it." };
  refresh();
  return { ok: true, message: "Saved." };
}

const paymentSchema = z.object({ id: z.uuid(), date: dateKey, amount: amountText.or(z.literal("")).default("") });

/** Records the actual payment (or income) and moves the next due date on. */
export async function recordRecurringPayment(input: z.input<typeof paymentSchema>): Promise<ActionResult> {
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const v = parsed.data;
  if (v.date > today(ctx)) return { ok: false, error: "Pick today or an earlier date.", fieldErrors: { date: ["Pick today or an earlier date."] } };
  const { data: r } = await ctx.supabase.from("recurring_transactions").select("currency, amount::text").eq("id", v.id).maybeSingle();
  if (!r) return { ok: false, error: "Not found." };
  let amount: string | null = null;
  if (v.amount) {
    const a = money(v.amount, r.currency);
    if (a === null) return precisionError("amount", r.currency);
    amount = r.amount.startsWith("-") ? `-${a}` : a;
  }
  const { error } = await ctx.supabase.rpc("record_recurring_payment", { p_recurring_id: v.id, p_occurred_on: v.date, p_amount: amount });
  if (error) return { ok: false, error: "Couldn't record it." };
  refresh();
  return { ok: true, message: "Recorded. The next date has moved on." };
}

/** Moves to the next date without recording a payment (e.g. a month you didn't pay). */
export async function skipRecurring(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid item." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data: r } = await ctx.supabase.from("recurring_transactions").select("next_due_on, every_n, unit, ends_on").eq("id", id).maybeSingle();
  if (!r) return { ok: false, error: "Not found." };
  const next = nextDue(r.next_due_on, r.every_n, r.unit);
  const { error } = await ctx.supabase.from("recurring_transactions").update(r.ends_on && next > r.ends_on ? { archived_at: new Date().toISOString() } : { next_due_on: next }).eq("id", id);
  if (error) return { ok: false, error: "Couldn't skip it." };
  refresh();
  return { ok: true, message: "Skipped to the next date." };
}

export async function deleteRecurring(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid item." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { error } = await ctx.supabase.from("recurring_transactions").delete().eq("id", id);
  if (error) return { ok: false, error: "Couldn't delete it." };
  refresh();
  return { ok: true, message: "Deleted. Past payments are kept." };
}

/* ------------------------------------------------------------------------ */
/* Exchange rates                                                            */
/* ------------------------------------------------------------------------ */

const rateSchema = z.object({
  base: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Pick a currency"),
  quote: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Pick a currency"),
  rate: z.string().trim().regex(/^\d{1,14}(\.\d{1,10})?$/, "Use a number like 125.5").refine((r) => Number(r) > 0, "Must be more than 0"),
  asOf: dateKey,
}).refine((v) => v.base !== v.quote, { path: ["quote"], message: "Pick two different currencies" });

export type RateInput = z.input<typeof rateSchema>;

/** Rates are the person's own: entered by hand, dated, never fetched. */
export async function saveRate(id: string | null, input: RateInput): Promise<ActionResult> {
  if (id !== null && !isUuid(id)) return { ok: false, error: "Invalid rate." };
  const parsed = rateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const v = parsed.data;
  if (v.asOf > today(ctx)) return { ok: false, error: "A rate can't be dated in the future.", fieldErrors: { asOf: ["Pick today or earlier."] } };
  const row = { base: v.base, quote: v.quote, rate: v.rate, as_of: v.asOf };
  const { error } = id
    ? await ctx.supabase.from("exchange_rates").update(row).eq("id", id)
    : await ctx.supabase.from("exchange_rates").insert({ ...row, user_id: ctx.viewer.userId, source: "manual" });
  if (error) return { ok: false, error: error.code === "23505" ? "You already have that rate for that date. Edit it instead." : "Couldn't save the rate." };
  refresh();
  return { ok: true, message: "Rate saved." };
}

export async function deleteRate(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid rate." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { error } = await ctx.supabase.from("exchange_rates").delete().eq("id", id);
  if (error) return { ok: false, error: "Couldn't delete the rate." };
  refresh();
  return { ok: true, message: "Rate deleted." };
}

/* ------------------------------------------------------------------------ */
/* Savings goals                                                             */
/* ------------------------------------------------------------------------ */

const savingsSchema = z.object({
  name: z.string().trim().min(1, "Name it").max(120),
  target: amountText,
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Pick a currency"),
  saved: amountText.or(z.literal("")).default(""),
  targetDate: optionalDate,
  accountId: optionalUuid,
  goalId: optionalUuid,
});

export type SavingsInput = z.input<typeof savingsSchema>;

export async function saveSavingsGoal(id: string | null, input: SavingsInput): Promise<ActionResult> {
  if (id !== null && !isUuid(id)) return { ok: false, error: "Invalid savings goal." };
  const parsed = savingsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const v = parsed.data;
  if (v.accountId) {
    const cur = await accountCurrency(ctx, v.accountId);
    if (cur !== v.currency) return { ok: false, error: "The linked account must be in the goal's currency.", fieldErrors: { accountId: ["Pick an account in the same currency."] } };
  }
  const target = money(v.target, v.currency);
  const saved = money(v.saved || "0", v.currency);
  if (target === null) return precisionError("target", v.currency);
  if (saved === null) return precisionError("saved", v.currency);
  if (toMinor(target, v.currency) === 0n) return { ok: false, error: "Set a target above zero.", fieldErrors: { target: ["Set a target above zero."] } };
  // With a linked account the account balance is the saved amount, so nothing is typed twice.
  const row = { name: v.name, target_amount: target, currency: v.currency, saved_amount: v.accountId ? "0" : saved, target_date: v.targetDate, account_id: v.accountId, goal_id: v.goalId };
  const { error } = id
    ? await ctx.supabase.from("savings_goals").update(row).eq("id", id)
    : await ctx.supabase.from("savings_goals").insert({ ...row, user_id: ctx.viewer.userId, source: "manual" });
  if (error) return { ok: false, error: "Couldn't save the savings goal." };
  refresh();
  return { ok: true, message: "Saved." };
}

export async function deleteSavingsGoal(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid savings goal." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { error } = await ctx.supabase.from("savings_goals").delete().eq("id", id);
  if (error) return { ok: false, error: "Couldn't delete it." };
  refresh();
  return { ok: true, message: "Deleted. No money was moved." };
}

/* ------------------------------------------------------------------------ */
/* Personal loans                                                            */
/* ------------------------------------------------------------------------ */

const loanName = (direction: "borrowed" | "lent", person: string) => `${direction === "borrowed" ? "Borrowed from" : "Lent to"} ${person}`.slice(0, 120);

const loanSchema = z.object({
  direction: z.enum(["borrowed", "lent"]),
  personName: z.string().trim().min(1, "Who is it with?").max(120),
  personId: optionalUuid,
  amount: amountText,
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Pick a currency"),
  startedOn: dateKey,
  dueOn: optionalDate,
  interestRate: z.union([z.literal(""), z.coerce.number().min(0, "Use 0 to 100").max(100, "Use 0 to 100")]).optional().transform((v) => (v === "" || v === undefined ? null : v)),
  /** The account the money went into (borrowed) or came out of (lent); empty when it was cash you don't track. */
  accountId: optionalUuid,
  notes: optionalText(2000),
});

export type LoanInput = z.input<typeof loanSchema>;

/** Records a new personal loan: its own account, plus a transfer with the account the money moved through. */
export async function createPersonalLoan(input: LoanInput): Promise<ActionResult<{ id: string }>> {
  const parsed = loanSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const v = parsed.data;
  if (v.startedOn > today(ctx)) return { ok: false, error: "Pick today or an earlier date.", fieldErrors: { startedOn: ["Pick today or an earlier date."] } };
  if (v.dueOn && v.dueOn < v.startedOn) return { ok: false, error: "The due date is before the start.", fieldErrors: { dueOn: ["Pick a date on or after the start."] } };
  if (v.accountId) {
    const cur = await accountCurrency(ctx, v.accountId);
    if (cur !== v.currency) return { ok: false, error: `Pick an account in ${v.currency}.`, fieldErrors: { accountId: [`Pick an account in ${v.currency}, or none.`] } };
  }
  const amt = money(v.amount, v.currency);
  if (amt === null) return precisionError("amount", v.currency);
  if (toMinor(amt, v.currency) === 0n) return { ok: false, error: "The amount can't be zero.", fieldErrors: { amount: ["The amount can't be zero."] } };
  const { data, error } = await ctx.supabase.rpc("create_personal_loan", {
    p_direction: v.direction, p_person_name: v.personName, p_person_id: v.personId, p_amount: amt, p_currency: v.currency,
    p_started_on: v.startedOn, p_due_on: v.dueOn, p_interest_rate: v.interestRate, p_notes: v.notes, p_via_account: v.accountId,
  });
  if (error) return { ok: false, error: error.code === "23514" ? error.message : "Couldn't save the loan." };
  refresh();
  return { ok: true, data: { id: data as string }, message: v.direction === "borrowed" ? `Loan from ${v.personName} added.` : `Loan to ${v.personName} added.` };
}

const loanEditSchema = z.object({
  personName: z.string().trim().min(1, "Who is it with?").max(120),
  personId: optionalUuid,
  dueOn: optionalDate,
  interestRate: loanSchema.shape.interestRate,
  notes: optionalText(2000),
});

export type LoanEditInput = z.input<typeof loanEditSchema>;

/** Changes who, when and notes. Amounts change through payments, so the history stays true. */
export async function updatePersonalLoan(id: string, input: LoanEditInput): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid loan." };
  const parsed = loanEditSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const v = parsed.data;
  const { data: loan } = await ctx.supabase.from("personal_loans").select("account_id, direction, started_on").eq("id", id).maybeSingle();
  if (!loan) return { ok: false, error: "Loan not found." };
  if (v.dueOn && v.dueOn < loan.started_on) return { ok: false, error: "The due date is before the start.", fieldErrors: { dueOn: ["Pick a date on or after the start."] } };
  const { error } = await ctx.supabase.from("personal_loans").update({ person_name: v.personName, person_id: v.personId, due_on: v.dueOn, notes: v.notes }).eq("id", id);
  if (error) return { ok: false, error: "Couldn't save the loan." };
  await ctx.supabase.from("financial_accounts").update({ name: loanName(loan.direction, v.personName), interest_rate: v.interestRate }).eq("id", loan.account_id);
  refresh();
  return { ok: true, message: "Saved." };
}

const loanPaymentSchema = z.object({
  loanId: z.uuid(),
  /** "repay": money coming back (or going back); "add": more borrowed or lent. */
  kind: z.enum(["repay", "add"]),
  amount: amountText,
  date: dateKey,
  accountId: optionalUuid,
  description: optionalText(300),
});

export type LoanPaymentInput = z.input<typeof loanPaymentSchema>;

/**
 * Money changing hands on a personal loan. Through one of your accounts it's
 * a transfer; otherwise a balance correction on the loan. Neither counts as
 * income or spending.
 */
export async function recordLoanPayment(input: LoanPaymentInput): Promise<ActionResult> {
  const parsed = loanPaymentSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const v = parsed.data;
  if (v.date > today(ctx)) return { ok: false, error: "Pick today or an earlier date.", fieldErrors: { date: ["Pick today or an earlier date."] } };
  const { data: loan } = await ctx.supabase.from("personal_loans").select("account_id, direction, person_name, currency").eq("id", v.loanId).maybeSingle();
  if (!loan) return { ok: false, error: "Loan not found." };
  const c = loan.currency;
  const amt = money(v.amount, c);
  if (amt === null) return precisionError("amount", c);
  if (toMinor(amt, c) === 0n) return { ok: false, error: "The amount can't be zero.", fieldErrors: { amount: ["The amount can't be zero."] } };
  const { data: bal } = await ctx.supabase.from("account_balances").select("balance::text").eq("account_id", loan.account_id).maybeSingle();
  if (!bal) return { ok: false, error: "This loan is closed. Reopen it first." };
  const borrowed = loan.direction === "borrowed";
  if (v.kind === "repay") {
    const owed = toMinor(bal.balance, c) * (borrowed ? -1n : 1n);
    if (toMinor(amt, c) > owed) {
      const left = fromMinor(owed > 0n ? owed : 0n, c);
      return { ok: false, error: `That's more than what's left (${left} ${c}).`, fieldErrors: { amount: [`Only ${left} ${c} is left.`] } };
    }
  }
  // Does money leave the loan's account (toward you) or arrive in it?
  const intoLoan = borrowed === (v.kind === "repay");
  const description = v.description ?? (v.kind === "repay" ? (borrowed ? `Paid back ${loan.person_name}` : `${loan.person_name} paid back`) : (borrowed ? `Borrowed more from ${loan.person_name}` : `Lent more to ${loan.person_name}`));
  if (v.accountId) {
    const cur = await accountCurrency(ctx, v.accountId);
    if (cur !== c) return { ok: false, error: `Pick an account in ${c}.`, fieldErrors: { accountId: [`Pick an account in ${c}, or none.`] } };
    const { error } = await ctx.supabase.rpc("create_transfer", {
      p_from_account: intoLoan ? v.accountId : loan.account_id, p_to_account: intoLoan ? loan.account_id : v.accountId,
      p_from_amount: amt, p_to_amount: amt, p_occurred_on: v.date, p_description: description,
    });
    if (error) return { ok: false, error: error.code === "23514" ? error.message : "Couldn't record it." };
  } else {
    const { error } = await ctx.supabase.from("transactions").insert({
      user_id: ctx.viewer.userId, account_id: loan.account_id, kind: "adjustment", amount: intoLoan ? amt : `-${amt}`, currency: c, occurred_on: v.date, description, source: "manual",
    });
    if (error) return { ok: false, error: "Couldn't record it." };
  }
  refresh();
  return { ok: true, message: v.kind === "repay" ? "Payment recorded." : "Added to the loan." };
}

/** Deletes the loan, its account and its history; transfers come off the other account too. */
export async function deletePersonalLoan(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid loan." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data: loan } = await ctx.supabase.from("personal_loans").select("account_id, person_name, direction").eq("id", id).maybeSingle();
  if (!loan) return { ok: false, error: "Loan not found." };
  const { data, error } = await ctx.supabase.from("financial_accounts").delete().eq("id", loan.account_id).select("id");
  if (error || !data?.length) return { ok: false, error: "Couldn't delete the loan." };
  await audit(ctx, "personal_loan.deleted", { type: "personal_loan", id }, { person: loan.person_name, direction: loan.direction });
  refresh();
  return { ok: true, message: "Loan deleted." };
}

/* ------------------------------------------------------------------------ */
/* CSV import                                                                */
/* ------------------------------------------------------------------------ */

const importSchema = z.object({
  accountId: z.uuid(),
  categoryId: optionalUuid,
  rows: z.array(z.object({
    occurred_on: dateKey,
    amount: signedAmountText,
    description: z.string().max(300),
    payee: z.string().max(200).nullable(),
    external_id: z.string().min(1).max(200),
  })).min(1, "Nothing to import").max(250),
});

export type ImportInput = z.input<typeof importSchema>;

/**
 * Inserts parsed statement rows (the screen parses and previews them first).
 * Rows already imported into this account are skipped, so importing the
 * same file twice adds nothing.
 */
export async function importTransactions(input: ImportInput): Promise<ActionResult<{ added: number; skipped: number }>> {
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Some rows couldn't be read. Check the preview and try again." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const v = parsed.data;
  const currency = await accountCurrency(ctx, v.accountId);
  if (!currency) return { ok: false, error: "Pick an open account." };
  let catKind: string | null = null;
  if (v.categoryId) {
    const { data } = await ctx.supabase.from("transaction_categories").select("kind").eq("id", v.categoryId).maybeSingle();
    catKind = data?.kind ?? null;
  }
  const t = today(ctx);
  const rows = [];
  for (const r of v.rows) {
    const amt = money(r.amount, currency);
    if (amt === null || toMinor(amt, currency) === 0n || r.occurred_on > t) return { ok: false, error: `A row dated ${r.occurred_on} has an invalid amount or date.` };
    const kind = amt.startsWith("-") ? "expense" : "income";
    rows.push({
      user_id: ctx.viewer.userId, account_id: v.accountId, currency, kind, amount: amt, occurred_on: r.occurred_on,
      description: r.description || null, payee: r.payee, external_id: r.external_id, source: "imported" as const,
      category_id: catKind === kind ? v.categoryId : null,
    });
  }
  const { data: existing, error: exErr } = await ctx.supabase.from("transactions").select("external_id").eq("account_id", v.accountId).in("external_id", rows.map((r) => r.external_id));
  if (exErr) return { ok: false, error: "Couldn't check for earlier imports." };
  const have = new Set((existing ?? []).map((e) => e.external_id));
  const fresh = rows.filter((r) => !have.has(r.external_id));
  if (fresh.length) {
    const { error } = await ctx.supabase.from("transactions").insert(fresh);
    if (error) return { ok: false, error: "Couldn't import the rows. Nothing was added." };
  }
  await audit(ctx, "transactions.imported", { type: "financial_account", id: v.accountId }, { added: fresh.length, skipped: rows.length - fresh.length });
  refresh();
  return { ok: true, data: { added: fresh.length, skipped: rows.length - fresh.length }, message: `Imported ${fresh.length} transaction${fresh.length === 1 ? "" : "s"}${rows.length - fresh.length ? `; skipped ${rows.length - fresh.length} already imported` : ""}.` };
}
