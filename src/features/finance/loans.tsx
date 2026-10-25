"use client";

import { useState } from "react";
import { ChevronDown, HandCoins, Handshake, Landmark, Lock, Pencil, Plus, RotateCcw } from "lucide-react";
import { FormActions, useActionForm } from "@/components/data/action-form";
import { ConfirmDelete } from "@/components/data/confirm-delete";
import { EmptyState } from "@/components/data/empty-state";
import { ProvenanceBadge } from "@/components/data/provenance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { fromMinor, toMinor, totalsByCurrency } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  createPersonalLoan, deletePersonalLoan, recordLoanPayment, setAccountArchived, updatePersonalLoan,
  type LoanEditInput, type LoanInput, type LoanPaymentInput,
} from "@/server/actions/finance";
import { useServerAction } from "@/features/dashboard/use-server-action";
import { loanSummary, type LoanSummary } from "./ledger";
import { DebtCard } from "./plans";
import { Amount, SectionTitle, dateLabel, money, useFinance, useNav } from "./shared";
import type { Account, FinanceWorkspace, LoanDirection, LoanEntry, PersonalLoan } from "./types";

const trimZeros = (n: string) => (n.includes(".") ? n.replace(/\.?0+$/, "") : n);

type Row = { loan: PersonalLoan; account: Account | undefined; entries: LoanEntry[]; s: LoanSummary; closed: boolean };

/** Every loan with its account, history and standing. The balance is worked out from the history so closed loans read right too. */
function loanRows(ws: FinanceWorkspace): Row[] {
  return ws.loans.map((loan) => {
    const account = ws.accounts.find((a) => a.id === loan.account_id);
    const entries = ws.loanEntries.filter((e) => e.account_id === loan.account_id);
    const opening = account?.opening_balance ?? "0";
    let bal = toMinor(opening, loan.currency);
    for (const e of entries) bal += toMinor(e.amount, loan.currency);
    const s = loanSummary(loan, { opening_balance: opening, balance: fromMinor(bal, loan.currency) }, entries, ws.today);
    return { loan, account, entries, s, closed: !!account?.archived_at };
  });
}

export function LoansTab() {
  const ws = useFinance();
  const { open } = useNav();
  const rows = loanRows(ws);
  const active = rows.filter((r) => !r.closed);
  const closed = rows.filter((r) => r.closed);
  const borrowed = active.filter((r) => r.loan.direction === "borrowed");
  const lent = active.filter((r) => r.loan.direction === "lent");
  const loanAccounts = new Set(ws.loans.map((l) => l.account_id));
  const debts = ws.accounts.filter((a) => a.is_liability && !a.archived_at && !loanAccounts.has(a.id));
  const iOwe = totalsByCurrency(borrowed.map((r) => r.s.outstanding)).filter((m) => toMinor(m.amount, m.currency) !== 0n);
  const owedToMe = totalsByCurrency(lent.map((r) => r.s.outstanding)).filter((m) => toMinor(m.amount, m.currency) !== 0n);

  return (
    <div className="grid gap-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <Total label="I owe people" items={iOwe} count={borrowed.filter((r) => !r.s.settled).length} />
        <Total label="People owe me" items={owedToMe} count={lent.filter((r) => !r.s.settled).length} />
      </div>

      <LoanSection title="Money I borrowed" direction="borrowed" rows={borrowed} onNew={() => open({ k: "loan", x: null, direction: "borrowed" })}
        empty="Money from family, a friend or a colleague: note who, how much and when it's due, then record each repayment." />
      <LoanSection title="Money I lent" direction="lent" rows={lent} onNew={() => open({ k: "loan", x: null, direction: "lent" })}
        empty="Lent someone money? Keep track of what's still owed to you and when they said they'd pay it back." />

      {closed.length > 0 && <ClosedLoans rows={closed} />}

      <section className="grid gap-2">
        <SectionTitle action={<Button size="sm" variant="ghost" onClick={() => open({ k: "account", x: null })}><Plus /> Card or loan</Button>}>Cards &amp; bank loans</SectionTitle>
        {debts.length === 0 ? (
          <Card><EmptyState compact icon={Landmark} title="No cards or bank loans">Add a credit card or loan account to see what you owe and a payoff estimate.</EmptyState></Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">{debts.map((a) => <DebtCard key={a.id} a={a} />)}</div>
        )}
        <p className="text-[11px] text-muted-foreground">Pay a card or loan with a transfer from your bank account, so it&apos;s not counted as spending twice.</p>
      </section>

      <p className="text-[11px] text-muted-foreground">
        Each personal loan has its own account, so it counts in net worth. Money changing hands is recorded as a transfer with your account (or a balance correction for cash you don&apos;t track), so it never shows up as income or spending.
      </p>
    </div>
  );
}

function Total({ label, items, count }: { label: string; items: { amount: string; currency: string }[]; count: number }) {
  return (
    <Card className="grid content-start gap-1 p-4">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      {items.length === 0 ? (
        <span className="font-display text-xl font-normal tracking-[-0.01em] text-muted-foreground">Nothing</span>
      ) : (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {items.map((m) => <Amount key={m.currency} m={m} className="font-display text-xl font-normal tracking-[-0.01em]" />)}
        </div>
      )}
      <span className="text-[11px] text-muted-foreground">{count === 0 ? "No open loans" : `${count} open loan${count === 1 ? "" : "s"}`}{items.length > 1 ? " · each currency shown on its own" : ""}</span>
    </Card>
  );
}

function LoanSection({ title, direction, rows, onNew, empty }: { title: string; direction: LoanDirection; rows: Row[]; onNew: () => void; empty: string }) {
  return (
    <section className="grid gap-2">
      <SectionTitle action={<Button size="sm" onClick={onNew}><Plus /> {direction === "borrowed" ? "I borrowed" : "I lent"}</Button>}>{title}</SectionTitle>
      {rows.length === 0 ? (
        <Card><EmptyState compact icon={direction === "borrowed" ? HandCoins : Handshake} title={direction === "borrowed" ? "No money borrowed" : "No money lent"}>{empty}</EmptyState></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">{rows.map((r) => <LoanCard key={r.loan.id} r={r} />)}</div>
      )}
    </section>
  );
}

function DueBadge({ due, dueOn }: { due: LoanSummary["due"]; dueOn: string }) {
  const ws = useFinance();
  if (!due) return null;
  if (due.state === "overdue") return <Badge variant="danger">Overdue by {-due.inDays} day{due.inDays === -1 ? "" : "s"}</Badge>;
  if (due.state === "today") return <Badge variant="warning">Due today</Badge>;
  if (due.state === "soon") return <Badge variant="warning">Due in {due.inDays} day{due.inDays === 1 ? "" : "s"}</Badge>;
  return <Badge variant="outline">Due {dateLabel(dueOn, ws.today, ws.locale)}</Badge>;
}

function LoanCard({ r }: { r: Row }) {
  const ws = useFinance();
  const { open } = useNav();
  const { run, pending } = useServerAction();
  const [showHistory, setShowHistory] = useState(false);
  const { loan, s, entries, account } = r;
  const borrowed = loan.direction === "borrowed";
  const person = loan.person_id ? ws.people.find((p) => p.id === loan.person_id) : null;
  const rate = account?.interest_rate ? Number(account.interest_rate) : null;

  return (
    <Card className="grid content-start gap-3 p-4">
      <div className="flex items-start gap-2">
        <div className="grid min-w-0 flex-1 gap-0.5">
          <span className="flex flex-wrap items-center gap-1.5 text-[14px] font-medium">
            {loan.person_name}
            <ProvenanceBadge source={loan.source} />
            {s.settled ? <Badge variant="success">Paid off</Badge> : loan.due_on && <DueBadge due={s.due} dueOn={loan.due_on} />}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {[`Since ${dateLabel(loan.started_on, ws.today, ws.locale)}`, rate !== null ? `${rate}% a year` : null, person ? "In Relationships" : null].filter(Boolean).join(" · ")}
          </span>
        </div>
        <Button size="icon-sm" variant="ghost" aria-label={`Edit loan with ${loan.person_name}`} onClick={() => open({ k: "loan", x: loan })}><Pencil /></Button>
        <ConfirmDelete size="icon-sm" label={`Delete loan with ${loan.person_name}`} disabled={pending} title={`Delete the loan with ${loan.person_name}?`}
          description="The loan and its whole history are deleted. Repayments made through your accounts are taken off those accounts too. To keep the history, close it once it's paid off instead."
          onConfirm={() => run(() => deletePersonalLoan(loan.id))} />
      </div>

      <p className="text-[13px]">
        <Amount m={s.outstanding} className="font-display text-xl font-normal tracking-[-0.01em]" />{" "}
        <span className="text-muted-foreground">{s.settled ? "left" : borrowed ? "left to pay back" : "still owed to you"}</span>
      </p>
      <div className="grid gap-1.5">
        <Progress value={s.pct} aria-label={`${loan.person_name}: ${Math.round(s.pct)}% paid back`} indicatorClassName={s.settled ? "bg-success" : undefined} />
        <div className="flex flex-wrap items-baseline gap-x-1 text-[12px] text-muted-foreground">
          <Amount m={s.repaid} className="text-foreground" /> paid back of <Amount m={s.total} className="text-foreground" />
          <span className="ml-auto">{Math.round(s.pct)}%</span>
        </div>
        {s.overpaid && <p className="text-[12px] text-destructive">Overpaid by <Amount m={s.overpaid} />. Check the history below.</p>}
      </div>
      {loan.notes && <p className="text-[12px] whitespace-pre-line text-muted-foreground">{loan.notes}</p>}

      <div className="flex flex-wrap items-center gap-1.5">
        {s.settled ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setAccountArchived(loan.account_id, true))}><Lock /> Close loan</Button>
        ) : (
          <Button size="sm" onClick={() => open({ k: "loanPay", x: loan, kind: "repay" })}>{borrowed ? "Record repayment" : "Record money back"}</Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => open({ k: "loanPay", x: loan, kind: "add" })}><Plus /> {borrowed ? "Borrowed more" : "Lent more"}</Button>
        {entries.length > 0 && (
          <Button size="sm" variant="ghost" className="ml-auto" aria-expanded={showHistory} onClick={() => setShowHistory((v) => !v)}>
            History ({entries.length}) <ChevronDown className={cn("transition-transform", showHistory && "rotate-180")} />
          </Button>
        )}
      </div>
      {showHistory && <LoanHistory loan={loan} entries={entries} />}
    </Card>
  );
}

function LoanHistory({ loan, entries }: { loan: PersonalLoan; entries: LoanEntry[] }) {
  const ws = useFinance();
  const sign = loan.direction === "borrowed" ? -1 : 1;
  return (
    <ul className="grid divide-y divide-border rounded-md border border-border text-[12px]">
      {entries.map((e) => {
        const adds = Number(e.amount) * sign > 0;
        const other = e.other_account_id ? ws.accounts.find((a) => a.id === e.other_account_id) : null;
        return (
          <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 py-2">
            <span className="w-14 shrink-0 text-muted-foreground">{dateLabel(e.occurred_on, ws.today, ws.locale)}</span>
            <span className="min-w-0 flex-1">
              {e.description || (adds ? (loan.direction === "borrowed" ? "Borrowed" : "Lent") : "Paid back")}
              <span className="text-muted-foreground">{other ? ` · ${adds === (loan.direction === "borrowed") ? "into" : "from"} ${other.name}` : e.kind === "adjustment" ? " · not through an account" : ""}</span>
            </span>
            <Amount m={money(e.amount.replace(/^-/, ""), loan.currency)} className={cn(!adds && "text-success")} />
          </li>
        );
      })}
    </ul>
  );
}

function ClosedLoans({ rows }: { rows: Row[] }) {
  const ws = useFinance();
  const { run, pending } = useServerAction();
  const [openList, setOpenList] = useState(false);
  return (
    <section className="grid gap-2">
      <button type="button" className="flex w-fit cursor-pointer items-center gap-1 text-[13px] font-medium" aria-expanded={openList} onClick={() => setOpenList((v) => !v)}>
        Closed loans ({rows.length}) <ChevronDown className={cn("size-4 transition-transform", openList && "rotate-180")} />
      </button>
      {openList && (
        <Card className="divide-y divide-border">
          {rows.map(({ loan, s }) => (
            <div key={loan.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[13px]">
              <span className="min-w-0 flex-1">
                {loan.direction === "borrowed" ? "Borrowed from" : "Lent to"} {loan.person_name}
                <span className="text-[11px] text-muted-foreground"> · since {dateLabel(loan.started_on, ws.today, ws.locale)}</span>
              </span>
              <Amount m={s.total} className="text-muted-foreground" />
              <Button size="xs" variant="ghost" disabled={pending} onClick={() => run(() => setAccountArchived(loan.account_id, false))}><RotateCcw /> Reopen</Button>
              <ConfirmDelete size="icon-sm" label={`Delete loan with ${loan.person_name}`} disabled={pending} title={`Delete the loan with ${loan.person_name}?`}
                description="The loan and its whole history are deleted, including repayments on your other accounts." onConfirm={() => run(() => deletePersonalLoan(loan.id))} />
            </div>
          ))}
        </Card>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* Forms                                                                     */
/* ------------------------------------------------------------------------ */

function PeopleList({ id }: { id: string }) {
  const ws = useFinance();
  return <datalist id={id}>{ws.people.map((p) => <option key={p.id} value={p.name} />)}</datalist>;
}

/** Matches a typed name to someone in Relationships, so the loan shows up with them. */
const personIdFor = (ws: FinanceWorkspace, name: string) => ws.people.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase())?.id ?? "";

export function LoanForm({ loan, direction = "borrowed", onDone, onCancel }: { loan: PersonalLoan | null; direction?: LoanDirection; onDone: () => void; onCancel: () => void }) {
  return loan ? <LoanEditForm loan={loan} onDone={onDone} onCancel={onCancel} /> : <LoanNewForm direction={direction} onDone={onDone} onCancel={onCancel} />;
}

function LoanNewForm({ direction, onDone, onCancel }: { direction: LoanDirection; onDone: () => void; onCancel: () => void }) {
  const ws = useFinance();
  const { v, set, err, pending, submit } = useActionForm<LoanInput>(() => ({
    direction, personName: "", personId: "", amount: "", currency: ws.baseCurrency, startedOn: ws.today, dueOn: "", interestRate: "", accountId: "", notes: "",
  }));
  const borrowed = v.direction === "borrowed";
  const accounts = ws.accounts.filter((a) => !a.archived_at && a.currency === v.currency && !ws.loans.some((l) => l.account_id === a.id));
  return (
    <form noValidate className="grid gap-4" onSubmit={submit((x) => createPersonalLoan({ ...x, personId: personIdFor(ws, x.personName) }), onDone)}>
      <div role="radiogroup" aria-label="Direction" className="flex w-fit rounded-full bg-tint-mist p-1">
        {(["borrowed", "lent"] as const).map((d) => (
          <button key={d} type="button" role="radio" aria-checked={v.direction === d} onClick={() => set("direction", d)}
            className={`h-9 cursor-pointer rounded-full px-3.5 text-[13px] ${v.direction === d ? "bg-card font-medium shadow-clay" : "text-muted-foreground"}`}>
            {d === "borrowed" ? "I borrowed" : "I lent"}
          </button>
        ))}
      </div>
      <Field id="loan-person" label={borrowed ? "Borrowed from" : "Lent to"} error={err("personName")} hint={ws.people.length ? "Pick someone from Relationships or type any name." : undefined}>
        <Input id="loan-person" autoFocus list="loan-people" value={v.personName} maxLength={120} placeholder="Name" onChange={(e) => set("personName", e.target.value)} aria-invalid={!!err("personName")} />
        <PeopleList id="loan-people" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem_10rem]">
        <Field id="loan-amount" label="Amount" error={err("amount")}>
          <Input id="loan-amount" inputMode="decimal" value={v.amount} onChange={(e) => set("amount", e.target.value)} aria-invalid={!!err("amount")} />
        </Field>
        <Field id="loan-currency" label="Currency" error={err("currency")}>
          <NativeSelect id="loan-currency" value={v.currency} onChange={(e) => { set("currency", e.target.value); set("accountId", ""); }}>
            {ws.currencies.map((c) => <option key={c} value={c}>{c}</option>)}
          </NativeSelect>
        </Field>
        <Field id="loan-start" label="Date" error={err("startedOn")}>
          <Input id="loan-start" type="date" max={ws.today} value={v.startedOn} onChange={(e) => set("startedOn", e.target.value)} aria-invalid={!!err("startedOn")} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="loan-account" label={borrowed ? "Money went into" : "Money came out of"} error={err("accountId")} hint="Moves the money in that account too, as a transfer (not income or spending).">
          <NativeSelect id="loan-account" value={v.accountId ?? ""} onChange={(e) => set("accountId", e.target.value)} aria-invalid={!!err("accountId")}>
            <option value="">Not through an account</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
          </NativeSelect>
        </Field>
        <Field id="loan-due" label="Pay back by" optional error={err("dueOn")}>
          <Input id="loan-due" type="date" min={v.startedOn} value={v.dueOn ?? ""} onChange={(e) => set("dueOn", e.target.value)} aria-invalid={!!err("dueOn")} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <Field id="loan-rate" label="Interest (% a year)" optional error={err("interestRate")}>
          <Input id="loan-rate" inputMode="decimal" value={String(v.interestRate ?? "")} onChange={(e) => set("interestRate", e.target.value)} aria-invalid={!!err("interestRate")} />
        </Field>
        <Field id="loan-notes" label="Notes" optional>
          <Textarea id="loan-notes" rows={2} maxLength={2000} value={v.notes ?? ""} placeholder="What it was for, what you agreed" onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </div>
      <FormActions pending={pending} label="Add loan" onCancel={onCancel} />
    </form>
  );
}

function LoanEditForm({ loan, onDone, onCancel }: { loan: PersonalLoan; onDone: () => void; onCancel: () => void }) {
  const ws = useFinance();
  const account = ws.accounts.find((a) => a.id === loan.account_id);
  const { v, set, err, pending, submit } = useActionForm<LoanEditInput>(() => ({
    personName: loan.person_name, personId: loan.person_id ?? "", dueOn: loan.due_on ?? "", interestRate: trimZeros(account?.interest_rate ?? ""), notes: loan.notes ?? "",
  }));
  return (
    <form noValidate className="grid gap-4" onSubmit={submit((x) => updatePersonalLoan(loan.id, { ...x, personId: personIdFor(ws, x.personName) }), onDone)}>
      <Field id="loan-person" label={loan.direction === "borrowed" ? "Borrowed from" : "Lent to"} error={err("personName")}>
        <Input id="loan-person" autoFocus list="loan-people" value={v.personName} maxLength={120} onChange={(e) => set("personName", e.target.value)} aria-invalid={!!err("personName")} />
        <PeopleList id="loan-people" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="loan-due" label="Pay back by" optional error={err("dueOn")}>
          <Input id="loan-due" type="date" min={loan.started_on} value={v.dueOn ?? ""} onChange={(e) => set("dueOn", e.target.value)} aria-invalid={!!err("dueOn")} />
        </Field>
        <Field id="loan-rate" label="Interest (% a year)" optional error={err("interestRate")}>
          <Input id="loan-rate" inputMode="decimal" value={String(v.interestRate ?? "")} onChange={(e) => set("interestRate", e.target.value)} aria-invalid={!!err("interestRate")} />
        </Field>
      </div>
      <Field id="loan-notes" label="Notes" optional>
        <Textarea id="loan-notes" rows={3} maxLength={2000} value={v.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
      </Field>
      <p className="text-[12px] text-muted-foreground">To change the amount, record a repayment or &ldquo;{loan.direction === "borrowed" ? "Borrowed more" : "Lent more"}&rdquo;, or delete a wrong entry under Transactions.</p>
      <FormActions pending={pending} label="Save changes" onCancel={onCancel} />
    </form>
  );
}

export function LoanPaymentForm({ loan, kind, onDone, onCancel }: { loan: PersonalLoan; kind: "repay" | "add"; onDone: () => void; onCancel: () => void }) {
  const ws = useFinance();
  const row = loanRows(ws).find((r) => r.loan.id === loan.id);
  const { v, set, err, pending, submit } = useActionForm<LoanPaymentInput>(() => ({ loanId: loan.id, kind, amount: "", date: ws.today, accountId: "", description: "" }));
  const borrowed = loan.direction === "borrowed";
  const repay = v.kind === "repay";
  const accounts = ws.accounts.filter((a) => !a.archived_at && a.currency === loan.currency && !ws.loans.some((l) => l.account_id === a.id));
  // Money leaves you when you repay a loan you took, or lend more.
  const out = borrowed === repay;
  return (
    <form noValidate className="grid gap-4" onSubmit={submit(recordLoanPayment, onDone)}>
      <div role="radiogroup" aria-label="What happened" className="flex w-fit rounded-full bg-tint-mist p-1">
        {(["repay", "add"] as const).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={v.kind === k} onClick={() => set("kind", k)}
            className={`h-9 cursor-pointer rounded-full px-3.5 text-[13px] ${v.kind === k ? "bg-card font-medium shadow-clay" : "text-muted-foreground"}`}>
            {k === "repay" ? (borrowed ? "I paid back" : "They paid back") : (borrowed ? "I borrowed more" : "I lent more")}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="lp-amount" label={`Amount (${loan.currency})`} error={err("amount")}
          hint={row && repay ? <>Left: <Amount m={row.s.outstanding} className="text-foreground" /> <button type="button" className="cursor-pointer text-brand underline-offset-2 hover:underline" onClick={() => set("amount", trimZeros(row.s.outstanding.amount))}>Pay it all</button></> : undefined}>
          <Input id="lp-amount" autoFocus inputMode="decimal" value={v.amount} onChange={(e) => set("amount", e.target.value)} aria-invalid={!!err("amount")} />
        </Field>
        <Field id="lp-date" label="Date" error={err("date")}>
          <Input id="lp-date" type="date" max={ws.today} value={v.date} onChange={(e) => set("date", e.target.value)} aria-invalid={!!err("date")} />
        </Field>
      </div>
      <Field id="lp-account" label={out ? "Paid from" : "Received into"} error={err("accountId")} hint="Moves the money in that account too, as a transfer (not income or spending).">
        <NativeSelect id="lp-account" value={v.accountId ?? ""} onChange={(e) => set("accountId", e.target.value)} aria-invalid={!!err("accountId")}>
          <option value="">Not through an account</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
        </NativeSelect>
      </Field>
      <Field id="lp-desc" label="Note" optional>
        <Input id="lp-desc" maxLength={300} value={v.description ?? ""} onChange={(e) => set("description", e.target.value)} />
      </Field>
      <FormActions pending={pending} label={repay ? "Record payment" : "Add to loan"} onCancel={onCancel} />
    </form>
  );
}
