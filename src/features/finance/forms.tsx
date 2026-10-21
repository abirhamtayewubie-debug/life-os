"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { minorUnits } from "@/lib/money";
import {
  createTransfer, saveAccount, saveBudget, saveCategory, saveRate, saveRecurring, saveSavingsGoal, saveTransaction,
  type AccountInput, type BudgetInput, type RateInput, type RecurringInput, type SavingsInput, type TransactionInput, type TransferInput,
} from "@/server/actions/finance";
import type { ActionResult } from "@/server/actions/result";
import { useServerAction } from "@/features/dashboard/use-server-action";
import { useFinance } from "./shared";
import { ACCOUNT_KIND_LABEL, LIABILITY_KINDS, UNIT_LABEL, type Account, type AccountKind, type Budget, type Category, type Recurring, type SavingsGoal, type StoredRate, type Transaction, type Unit } from "./types";

type Errors = Record<string, string[] | undefined>;

/** Shared submit plumbing: field errors from the server land next to their inputs. */
function useForm<T extends object>(initial: () => T) {
  const [v, setV] = useState<T>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const { pending, run } = useServerAction();
  const set = <K extends keyof T>(k: K, val: T[K]) => setV((s) => ({ ...s, [k]: val }));
  const err = (k: string) => errors[k]?.[0];
  const submit = <R,>(fn: (v: T) => Promise<ActionResult<R>>, onDone: (r: Extract<ActionResult<R>, { ok: true }>) => void) => (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    run(async () => {
      const r = await fn(v);
      if (!r.ok && r.fieldErrors) setErrors(r.fieldErrors);
      return r;
    }, { onSuccess: onDone });
  };
  return { v, set, err, pending, submit };
}

function Actions({ pending, label, onCancel }: { pending: boolean; label: string; onCancel: () => void }) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : label}</Button>
    </div>
  );
}

const step = (currency: string) => (minorUnits(currency) ? `0.${"0".repeat(minorUnits(currency) - 1)}1` : "1");

function CategoryOptions({ categories, kind }: { categories: Category[]; kind: "income" | "expense" }) {
  const live = categories.filter((c) => c.kind === kind && !c.archived_at);
  const tops = live.filter((c) => !c.parent_id).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      {tops.map((t) => [
        <option key={t.id} value={t.id}>{t.name}</option>,
        ...live.filter((c) => c.parent_id === t.id).map((c) => <option key={c.id} value={c.id}>{`  ${t.name} › ${c.name}`}</option>),
      ])}
    </>
  );
}

function AccountOptions({ accounts }: { accounts: Account[] }) {
  return <>{accounts.filter((a) => !a.archived_at).map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}</>;
}

/* ------------------------------------------------------------------------ */

export function AccountForm({ account, onDone, onCancel }: { account: Account | null; onDone: () => void; onCancel: () => void }) {
  const ws = useFinance();
  const owed = (a: Account) => a.opening_balance.replace(/^-/, "");
  const { v, set, err, pending, submit } = useForm<AccountInput>(() => account
    ? { name: account.name, kind: account.kind, currency: account.currency, institution: account.institution ?? "", openingBalance: LIABILITY_KINDS.includes(account.kind) ? owed(account) : account.opening_balance, openingDate: account.opening_date, interestRate: account.interest_rate ?? "", includeInNetWorth: account.include_in_net_worth }
    : { name: "", kind: "checking", currency: ws.baseCurrency, institution: "", openingBalance: "", openingDate: ws.today, interestRate: "", includeInNetWorth: true });
  const liability = LIABILITY_KINDS.includes(v.kind as AccountKind);
  return (
    <form noValidate className="grid gap-4" onSubmit={submit((x) => saveAccount(account?.id ?? null, x), onDone)}>
      <div className="grid gap-4 sm:grid-cols-[1fr_11rem]">
        <Field id="acc-name" label="Account name" error={err("name")}>
          <Input id="acc-name" autoFocus value={v.name} maxLength={120} placeholder="CBE current, M-Pesa, Payoneer…" onChange={(e) => set("name", e.target.value)} aria-invalid={!!err("name")} />
        </Field>
        <Field id="acc-kind" label="Type">
          <NativeSelect id="acc-kind" value={v.kind} onChange={(e) => set("kind", e.target.value as AccountKind)}>
            {Object.entries(ACCOUNT_KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="acc-currency" label="Currency" error={err("currency")} hint={account ? "Fixed once it has transactions." : undefined}>
          <NativeSelect id="acc-currency" value={v.currency} onChange={(e) => set("currency", e.target.value)} aria-invalid={!!err("currency")}>
            {ws.currencies.map((c) => <option key={c} value={c}>{c}</option>)}
          </NativeSelect>
        </Field>
        <Field id="acc-opening" label={liability ? "Amount owed at start" : "Starting balance"} error={err("openingBalance")} optional>
          <Input id="acc-opening" inputMode="decimal" value={v.openingBalance} placeholder="0" onChange={(e) => set("openingBalance", e.target.value)} aria-invalid={!!err("openingBalance")} />
        </Field>
        <Field id="acc-date" label="As of" error={err("openingDate")}>
          <Input id="acc-date" type="date" max={ws.today} value={v.openingDate} onChange={(e) => set("openingDate", e.target.value)} aria-invalid={!!err("openingDate")} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="acc-inst" label="Bank or provider" optional>
          <Input id="acc-inst" value={v.institution ?? ""} maxLength={120} onChange={(e) => set("institution", e.target.value)} />
        </Field>
        {(liability || v.kind === "savings") && (
          <Field id="acc-rate" label="Interest rate (% a year)" optional error={err("interestRate")}>
            <Input id="acc-rate" inputMode="decimal" value={String(v.interestRate ?? "")} onChange={(e) => set("interestRate", e.target.value)} aria-invalid={!!err("interestRate")} />
          </Field>
        )}
      </div>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={!!v.includeInNetWorth} onChange={(e) => set("includeInNetWorth", e.target.checked)} className="size-4 accent-[var(--color-brand)]" /> Count it in net worth
      </label>
      <Actions pending={pending} label={account ? "Save changes" : "Add account"} onCancel={onCancel} />
    </form>
  );
}

/* ------------------------------------------------------------------------ */

export function TransactionForm({ tx, defaults, onDone, onCancel }: { tx: Transaction | null; defaults?: Partial<TransactionInput>; onDone: () => void; onCancel: () => void }) {
  const ws = useFinance();
  const open = ws.accounts.filter((a) => !a.archived_at);
  const { v, set, err, pending, submit } = useForm<TransactionInput>(() => tx
    ? { accountId: tx.account_id, kind: tx.kind === "transfer" ? "adjustment" : tx.kind, amount: tx.kind === "adjustment" ? tx.amount : tx.amount.replace(/^-/, ""), date: tx.occurred_on, categoryId: tx.category_id ?? "", projectId: tx.project_id ?? "", description: tx.description ?? "", payee: tx.payee ?? "", notes: tx.notes ?? "", pending: tx.is_pending }
    : { accountId: open[0]?.id ?? "", kind: "expense", amount: "", date: ws.today, categoryId: "", projectId: "", description: "", payee: "", notes: "", pending: false, ...defaults });
  const acct = ws.accounts.find((a) => a.id === v.accountId);
  return (
    <form noValidate className="grid gap-4" onSubmit={submit((x) => saveTransaction(tx?.id ?? null, x), onDone)}>
      <div role="radiogroup" aria-label="Type" className="flex w-fit rounded-md bg-muted p-0.5">
        {(["expense", "income", "adjustment"] as const).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={v.kind === k} onClick={() => { set("kind", k); set("categoryId", ""); }}
            className={`h-7 cursor-pointer rounded px-3 text-[13px] ${v.kind === k ? "bg-surface font-medium shadow-card" : "text-muted-foreground"}`}>
            {k === "expense" ? "Money out" : k === "income" ? "Money in" : "Balance correction"}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_10rem_10rem]">
        <Field id="tx-account" label="Account" error={err("accountId")}>
          <NativeSelect id="tx-account" value={v.accountId} onChange={(e) => set("accountId", e.target.value)}><AccountOptions accounts={ws.accounts} /></NativeSelect>
        </Field>
        <Field id="tx-amount" label={`Amount${acct ? ` (${acct.currency})` : ""}`} error={err("amount")} hint={v.kind === "adjustment" ? "Use a minus sign to lower the balance." : undefined}>
          <Input id="tx-amount" autoFocus inputMode="decimal" step={acct ? step(acct.currency) : undefined} value={v.amount} onChange={(e) => set("amount", e.target.value)} aria-invalid={!!err("amount")} />
        </Field>
        <Field id="tx-date" label="Date" error={err("date")}>
          <Input id="tx-date" type="date" value={v.date} onChange={(e) => set("date", e.target.value)} aria-invalid={!!err("date")} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="tx-desc" label="Description" optional>
          <Input id="tx-desc" value={v.description ?? ""} maxLength={300} onChange={(e) => set("description", e.target.value)} />
        </Field>
        {v.kind !== "adjustment" && (
          <Field id="tx-category" label="Category" optional error={err("categoryId")}>
            <NativeSelect id="tx-category" value={v.categoryId ?? ""} onChange={(e) => set("categoryId", e.target.value)} aria-invalid={!!err("categoryId")}>
              <option value="">Uncategorised</option>
              <CategoryOptions categories={ws.categories} kind={v.kind === "income" ? "income" : "expense"} />
            </NativeSelect>
          </Field>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="tx-payee" label={v.kind === "income" ? "From" : "Paid to"} optional>
          <Input id="tx-payee" value={v.payee ?? ""} maxLength={200} onChange={(e) => set("payee", e.target.value)} />
        </Field>
        {ws.projects.length > 0 && (
          <Field id="tx-project" label="Project" optional hint="Counts toward the project's budget.">
            <NativeSelect id="tx-project" value={v.projectId ?? ""} onChange={(e) => set("projectId", e.target.value)}>
              <option value="">None</option>
              {ws.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </NativeSelect>
          </Field>
        )}
      </div>
      <Field id="tx-notes" label="Notes" optional>
        <Textarea id="tx-notes" value={v.notes ?? ""} maxLength={2000} onChange={(e) => set("notes", e.target.value)} className="min-h-14" />
      </Field>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={!!v.pending} onChange={(e) => set("pending", e.target.checked)} className="size-4 accent-[var(--color-brand)]" /> Pending (not in the balance yet)
      </label>
      <Actions pending={pending} label={tx ? "Save changes" : "Add transaction"} onCancel={onCancel} />
    </form>
  );
}

/* ------------------------------------------------------------------------ */

export function TransferForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const ws = useFinance();
  const open = ws.accounts.filter((a) => !a.archived_at);
  const { v, set, err, pending, submit } = useForm<TransferInput>(() => ({ fromAccountId: open[0]?.id ?? "", toAccountId: open[1]?.id ?? "", fromAmount: "", toAmount: "", date: ws.today, description: "" }));
  const from = ws.accounts.find((a) => a.id === v.fromAccountId);
  const to = ws.accounts.find((a) => a.id === v.toAccountId);
  const cross = from && to && from.currency !== to.currency;
  return (
    <form noValidate className="grid gap-4" onSubmit={submit(createTransfer, onDone)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="tr-from" label="From" error={err("fromAccountId")}>
          <NativeSelect id="tr-from" value={v.fromAccountId} onChange={(e) => set("fromAccountId", e.target.value)}><AccountOptions accounts={ws.accounts} /></NativeSelect>
        </Field>
        <Field id="tr-to" label="To" error={err("toAccountId")}>
          <NativeSelect id="tr-to" value={v.toAccountId} onChange={(e) => set("toAccountId", e.target.value)} aria-invalid={!!err("toAccountId")}><AccountOptions accounts={ws.accounts} /></NativeSelect>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="tr-amount" label={`Sent${from ? ` (${from.currency})` : ""}`} error={err("fromAmount")}>
          <Input id="tr-amount" autoFocus inputMode="decimal" value={v.fromAmount} onChange={(e) => set("fromAmount", e.target.value)} aria-invalid={!!err("fromAmount")} />
        </Field>
        {cross && (
          <Field id="tr-to-amount" label={`Arrived (${to!.currency})`} error={err("toAmount")} hint="What actually landed, after fees.">
            <Input id="tr-to-amount" inputMode="decimal" value={v.toAmount} onChange={(e) => set("toAmount", e.target.value)} aria-invalid={!!err("toAmount")} />
          </Field>
        )}
        <Field id="tr-date" label="Date" error={err("date")}>
          <Input id="tr-date" type="date" max={ws.today} value={v.date} onChange={(e) => set("date", e.target.value)} />
        </Field>
      </div>
      <Field id="tr-desc" label="Description" optional>
        <Input id="tr-desc" value={v.description ?? ""} maxLength={300} placeholder={to && LIABILITY_KINDS.includes(to.kind) ? "Loan or card payment" : "Move to savings"} onChange={(e) => set("description", e.target.value)} />
      </Field>
      <p className="text-[12px] text-muted-foreground">A transfer moves money between your own accounts. It isn&apos;t income or spending, so it stays out of budgets and reports. Paying a card or loan from your bank is a transfer too.</p>
      <Actions pending={pending} label="Record transfer" onCancel={onCancel} />
    </form>
  );
}

/* ------------------------------------------------------------------------ */

export function CategoryForm({ category, onDone, onCancel }: { category: Category | null; onDone: () => void; onCancel: () => void }) {
  const ws = useFinance();
  const { v, set, err, pending, submit } = useForm(() => ({ name: category?.name ?? "", kind: category?.kind ?? ("expense" as "income" | "expense"), parentId: category?.parent_id ?? "" }));
  const parents = ws.categories.filter((c) => c.kind === v.kind && !c.parent_id && c.id !== category?.id && !c.archived_at);
  const hasChildren = !!category && ws.categories.some((c) => c.parent_id === category.id);
  return (
    <form noValidate className="grid gap-4" onSubmit={submit((x) => saveCategory(category?.id ?? null, x), onDone)}>
      <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
        <Field id="cat-name" label="Name" error={err("name")}>
          <Input id="cat-name" autoFocus value={v.name} maxLength={80} onChange={(e) => set("name", e.target.value)} aria-invalid={!!err("name")} />
        </Field>
        <Field id="cat-kind" label="For">
          <NativeSelect id="cat-kind" value={v.kind} disabled={!!category} onChange={(e) => { set("kind", e.target.value as "income" | "expense"); set("parentId", ""); }}>
            <option value="expense">Spending</option>
            <option value="income">Income</option>
          </NativeSelect>
        </Field>
      </div>
      {!hasChildren && (
        <Field id="cat-parent" label="Inside" optional hint="Sub-categories roll up into their parent in budgets and reports.">
          <NativeSelect id="cat-parent" value={v.parentId} onChange={(e) => set("parentId", e.target.value)}>
            <option value="">Nothing (top level)</option>
            {parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </NativeSelect>
        </Field>
      )}
      <Actions pending={pending} label={category ? "Save" : "Add category"} onCancel={onCancel} />
    </form>
  );
}

/* ------------------------------------------------------------------------ */

export function BudgetForm({ budget, onDone, onCancel }: { budget: Budget | null; onDone: () => void; onCancel: () => void }) {
  const ws = useFinance();
  const expense = ws.categories.filter((c) => c.kind === "expense" && !c.archived_at);
  const tops = expense.filter((c) => !c.parent_id).sort((a, b) => a.name.localeCompare(b.name));
  const ordered = tops.flatMap((t) => [t, ...expense.filter((c) => c.parent_id === t.id)]);
  const { v, set, err, pending, submit } = useForm<BudgetInput>(() => ({
    name: budget?.name ?? "Monthly spending", period: budget?.period ?? "monthly", currency: budget?.currency ?? ws.baseCurrency,
    lines: ordered.map((c) => ({ categoryId: c.id, amount: budget?.lines.find((l) => l.category_id === c.id)?.amount.replace(/\.?0+$/, "") ?? "" })),
  }));
  const setLine = (i: number, amount: string) => set("lines", v.lines.map((l, j) => (j === i ? { ...l, amount } : l)));
  return (
    <form noValidate className="grid gap-4" onSubmit={submit((x) => saveBudget(budget?.id ?? null, x), onDone)}>
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem_7rem]">
        <Field id="bud-name" label="Name" error={err("name")}>
          <Input id="bud-name" value={v.name} maxLength={120} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field id="bud-period" label="Every">
          <NativeSelect id="bud-period" value={v.period} onChange={(e) => set("period", e.target.value as "weekly" | "monthly")}>
            <option value="monthly">Month</option>
            <option value="weekly">Week</option>
          </NativeSelect>
        </Field>
        <Field id="bud-currency" label="Currency">
          <NativeSelect id="bud-currency" value={v.currency} onChange={(e) => set("currency", e.target.value)}>
            {ws.currencies.map((c) => <option key={c} value={c}>{c}</option>)}
          </NativeSelect>
        </Field>
      </div>
      {!ordered.length ? (
        <p className="text-[13px] text-muted-foreground">Add spending categories first (Accounts &amp; setup), then set an amount for each.</p>
      ) : (
        <fieldset className="grid gap-1.5">
          <legend className="mb-1 text-[13px] font-medium">Limit per {v.period === "weekly" ? "week" : "month"} <span className="font-normal text-muted-foreground">(leave blank to skip a category)</span></legend>
          <div className="grid max-h-72 gap-1.5 overflow-y-auto pr-1">
            {ordered.map((c, i) => (
              <label key={c.id} className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-2 text-[13px]">
                <span className={c.parent_id ? "truncate pl-4 text-muted-foreground" : "truncate"}>{c.name}</span>
                <Input inputMode="decimal" aria-label={`${c.name} limit`} value={v.lines[i]?.amount ?? ""} onChange={(e) => setLine(i, e.target.value)} className="h-8 text-right" />
              </label>
            ))}
          </div>
          {err("lines") && <p className="text-xs text-destructive">{err("lines")}</p>}
          <p className="text-[11px] text-muted-foreground">Spending in other currencies counts only when you&apos;ve entered a rate for it; anything without a rate is listed separately, never guessed.</p>
        </fieldset>
      )}
      <Actions pending={pending} label={budget ? "Save budget" : "Create budget"} onCancel={onCancel} />
    </form>
  );
}

/* ------------------------------------------------------------------------ */

type RecKind = RecurringInput["kind"];
const recKind = (r: Recurring): RecKind => (r.is_bill ? "bill" : r.is_subscription ? "subscription" : r.amount.startsWith("-") ? "other_out" : "income");

export function RecurringForm({ item, onDone, onCancel }: { item: Recurring | null; onDone: () => void; onCancel: () => void }) {
  const ws = useFinance();
  const open = ws.accounts.filter((a) => !a.archived_at);
  const { v, set, err, pending, submit } = useForm<RecurringInput>(() => item
    ? { accountId: item.account_id, categoryId: item.category_id ?? "", description: item.description, amount: item.amount.replace(/^-/, ""), kind: recKind(item), everyN: item.every_n, unit: item.unit, nextDueOn: item.next_due_on, endsOn: item.ends_on ?? "", remindDaysBefore: item.remind_days_before, autopay: item.autopay }
    : { accountId: open[0]?.id ?? "", categoryId: "", description: "", amount: "", kind: "bill", everyN: 1, unit: "month", nextDueOn: ws.today, endsOn: "", remindDaysBefore: 2, autopay: false });
  const n = Number(v.everyN) || 1;
  return (
    <form noValidate className="grid gap-4" onSubmit={submit((x) => saveRecurring(item?.id ?? null, x), onDone)}>
      <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
        <Field id="rec-desc" label="What" error={err("description")}>
          <Input id="rec-desc" autoFocus value={v.description} maxLength={200} placeholder="Rent, internet, Netflix…" onChange={(e) => set("description", e.target.value)} aria-invalid={!!err("description")} />
        </Field>
        <Field id="rec-kind" label="Type">
          <NativeSelect id="rec-kind" value={v.kind} onChange={(e) => { set("kind", e.target.value as RecKind); set("categoryId", ""); }}>
            <option value="bill">Bill</option>
            <option value="subscription">Subscription</option>
            <option value="other_out">Other regular payment</option>
            <option value="income">Regular income</option>
          </NativeSelect>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
        <Field id="rec-account" label={v.kind === "income" ? "Paid into" : "Paid from"} error={err("accountId")}>
          <NativeSelect id="rec-account" value={v.accountId} onChange={(e) => set("accountId", e.target.value)}><AccountOptions accounts={ws.accounts} /></NativeSelect>
        </Field>
        <Field id="rec-amount" label="Usual amount" error={err("amount")}>
          <Input id="rec-amount" inputMode="decimal" value={v.amount} onChange={(e) => set("amount", e.target.value)} aria-invalid={!!err("amount")} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="rec-every" label="Every" error={err("everyN")}>
          <div className="flex gap-2">
            <Input id="rec-every" inputMode="numeric" className="w-16" value={String(v.everyN)} onChange={(e) => set("everyN", e.target.value)} />
            <NativeSelect aria-label="Unit" value={v.unit} onChange={(e) => set("unit", e.target.value as Unit)}>
              {(["week", "month", "year"] as const).map((u) => <option key={u} value={u}>{UNIT_LABEL[u][n === 1 ? 0 : 1]}</option>)}
            </NativeSelect>
          </div>
        </Field>
        <Field id="rec-next" label="Next due" error={err("nextDueOn")}>
          <Input id="rec-next" type="date" value={v.nextDueOn} onChange={(e) => set("nextDueOn", e.target.value)} />
        </Field>
        <Field id="rec-ends" label="Ends" optional error={err("endsOn")}>
          <Input id="rec-ends" type="date" min={v.nextDueOn} value={v.endsOn ?? ""} onChange={(e) => set("endsOn", e.target.value)} aria-invalid={!!err("endsOn")} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="rec-category" label="Category" optional>
          <NativeSelect id="rec-category" value={v.categoryId ?? ""} onChange={(e) => set("categoryId", e.target.value)}>
            <option value="">Uncategorised</option>
            <CategoryOptions categories={ws.categories} kind={v.kind === "income" ? "income" : "expense"} />
          </NativeSelect>
        </Field>
        <Field id="rec-remind" label="Flag it days before" error={err("remindDaysBefore")}>
          <Input id="rec-remind" inputMode="numeric" value={String(v.remindDaysBefore)} onChange={(e) => set("remindDaysBefore", e.target.value)} />
        </Field>
      </div>
      {v.kind !== "income" && (
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={!!v.autopay} onChange={(e) => set("autopay", e.target.checked)} className="size-4 accent-[var(--color-brand)]" /> Paid automatically by my bank (a note for you; Life OS never moves money)
        </label>
      )}
      <Actions pending={pending} label={item ? "Save changes" : "Add"} onCancel={onCancel} />
    </form>
  );
}

/* ------------------------------------------------------------------------ */

export function RateForm({ rate, onDone, onCancel }: { rate: StoredRate | null; onDone: () => void; onCancel: () => void }) {
  const ws = useFinance();
  const other = ws.currencies.find((c) => c !== ws.baseCurrency) ?? "USD";
  const { v, set, err, pending, submit } = useForm<RateInput>(() => rate ? { base: rate.base, quote: rate.quote, rate: rate.rate.replace(/\.?0+$/, ""), asOf: rate.as_of } : { base: other, quote: ws.baseCurrency, rate: "", asOf: ws.today });
  return (
    <form noValidate className="grid gap-4" onSubmit={submit((x) => saveRate(rate?.id ?? null, x), onDone)}>
      <div className="grid grid-cols-[auto_1fr_auto_1fr] items-end gap-2 text-[13px]">
        <span className="pb-2">1</span>
        <Field id="rate-base" label="From">
          <NativeSelect id="rate-base" value={v.base} onChange={(e) => set("base", e.target.value)}>{ws.currencies.map((c) => <option key={c} value={c}>{c}</option>)}</NativeSelect>
        </Field>
        <span className="pb-2">=</span>
        <Field id="rate-quote" label="To" error={err("quote")}>
          <NativeSelect id="rate-quote" value={v.quote} onChange={(e) => set("quote", e.target.value)}>{ws.currencies.map((c) => <option key={c} value={c}>{c}</option>)}</NativeSelect>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="rate-value" label={`Rate (${v.quote} per 1 ${v.base})`} error={err("rate")}>
          <Input id="rate-value" autoFocus inputMode="decimal" value={v.rate} onChange={(e) => set("rate", e.target.value)} aria-invalid={!!err("rate")} />
        </Field>
        <Field id="rate-date" label="Rate date" error={err("asOf")}>
          <Input id="rate-date" type="date" max={ws.today} value={v.asOf} onChange={(e) => set("asOf", e.target.value)} />
        </Field>
      </div>
      <p className="text-[12px] text-muted-foreground">Use the rate you actually got or the one you trust (bank, parallel market). Totals use the newest rate on or before each date and always show which date.</p>
      <Actions pending={pending} label={rate ? "Save rate" : "Add rate"} onCancel={onCancel} />
    </form>
  );
}

/* ------------------------------------------------------------------------ */

export function SavingsForm({ goal, onDone, onCancel }: { goal: SavingsGoal | null; onDone: () => void; onCancel: () => void }) {
  const ws = useFinance();
  const { v, set, err, pending, submit } = useForm<SavingsInput>(() => goal
    ? { name: goal.name, target: goal.target_amount.replace(/\.?0+$/, ""), currency: goal.currency, saved: goal.saved_amount.replace(/\.?0+$/, ""), targetDate: goal.target_date ?? "", accountId: goal.account_id ?? "", goalId: goal.goal_id ?? "" }
    : { name: "", target: "", currency: ws.baseCurrency, saved: "", targetDate: "", accountId: "", goalId: "" });
  const accounts = ws.accounts.filter((a) => !a.archived_at && a.currency === v.currency && !LIABILITY_KINDS.includes(a.kind));
  return (
    <form noValidate className="grid gap-4" onSubmit={submit((x) => saveSavingsGoal(goal?.id ?? null, x), onDone)}>
      <Field id="sav-name" label="Saving for" error={err("name")}>
        <Input id="sav-name" autoFocus value={v.name} maxLength={120} placeholder="Emergency fund, laptop, school fees…" onChange={(e) => set("name", e.target.value)} aria-invalid={!!err("name")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="sav-target" label="Target" error={err("target")}>
          <Input id="sav-target" inputMode="decimal" value={v.target} onChange={(e) => set("target", e.target.value)} aria-invalid={!!err("target")} />
        </Field>
        <Field id="sav-currency" label="Currency">
          <NativeSelect id="sav-currency" value={v.currency} onChange={(e) => { set("currency", e.target.value); set("accountId", ""); }}>{ws.currencies.map((c) => <option key={c} value={c}>{c}</option>)}</NativeSelect>
        </Field>
        <Field id="sav-date" label="By" optional>
          <Input id="sav-date" type="date" min={ws.today} value={v.targetDate ?? ""} onChange={(e) => set("targetDate", e.target.value)} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="sav-account" label="Linked account" optional error={err("accountId")} hint="Its balance becomes the amount saved.">
          <NativeSelect id="sav-account" value={v.accountId ?? ""} onChange={(e) => set("accountId", e.target.value)} aria-invalid={!!err("accountId")}>
            <option value="">None: I&apos;ll enter it</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </NativeSelect>
        </Field>
        {!v.accountId && (
          <Field id="sav-saved" label="Saved so far" optional error={err("saved")}>
            <Input id="sav-saved" inputMode="decimal" value={v.saved} onChange={(e) => set("saved", e.target.value)} aria-invalid={!!err("saved")} />
          </Field>
        )}
      </div>
      {ws.goals.length > 0 && (
        <Field id="sav-goal" label="Goal" optional>
          <NativeSelect id="sav-goal" value={v.goalId ?? ""} onChange={(e) => set("goalId", e.target.value)}>
            <option value="">None</option>
            {ws.goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </NativeSelect>
        </Field>
      )}
      <Actions pending={pending} label={goal ? "Save" : "Add savings goal"} onCancel={onCancel} />
    </form>
  );
}
