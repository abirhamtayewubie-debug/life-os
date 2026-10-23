"use client";

import { useState } from "react";
import { CalendarClock, Check, Landmark, Pencil, PiggyBank, Plus, SkipForward, Target } from "lucide-react";
import { ConfirmDelete } from "@/components/data/confirm-delete";
import { EmptyState } from "@/components/data/empty-state";
import { ProvenanceBadge } from "@/components/data/provenance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { formatShortDate } from "@/lib/dates";
import { minorUnits, totalsByCurrency } from "@/lib/money";
import { cn } from "@/lib/utils";
import { deleteBudget, deleteRecurring, deleteSavingsGoal, skipRecurring } from "@/server/actions/finance";
import { useServerAction } from "@/features/dashboard/use-server-action";
import { absMoney, budgetStatus, dueState, monthlyEquivalent, payoffMonths, savingsProgress } from "./ledger";
import { Amount, RateNote, SectionTitle, dateLabel, money, savedFor, useFinance, useNav } from "./shared";
import { UNIT_LABEL, type Account, type Recurring } from "./types";

const every = (n: number, unit: Recurring["unit"]) => (n === 1 ? `Every ${UNIT_LABEL[unit][0]}` : `Every ${n} ${UNIT_LABEL[unit][1]}`);

/* ------------------------------------------------------------------------ */

export function BudgetsTab() {
  const ws = useFinance();
  const { open } = useNav();
  const { run, pending } = useServerAction();
  const hasExpenseCats = ws.categories.some((c) => c.kind === "expense" && !c.archived_at);

  if (!ws.budgets.length) {
    return (
      <Card>
        <EmptyState icon={Target} title="No budgets yet" action={<Button size="sm" disabled={!hasExpenseCats} onClick={() => open({ k: "budget", x: null })}><Plus /> Create a budget</Button>}>
          {hasExpenseCats ? "Set a weekly or monthly limit for the spending categories you care about. Spending in other currencies is converted with your own rates." : "Budgets are set per spending category. Add categories under Accounts & setup first."}
        </EmptyState>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex"><Button size="sm" className="ml-auto" onClick={() => open({ k: "budget", x: null })}><Plus /> New budget</Button></div>
      <div className="grid gap-4 lg:grid-cols-2">
        {ws.budgets.map((b) => {
          const s = budgetStatus(b, b.lines, ws.recent, ws.categories, ws.rates, ws.today, ws.weekStart);
          return (
            <Card key={b.id} className="grid content-start gap-4 p-5">
              <div className="flex flex-wrap items-start gap-2">
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <h3 className="flex items-center gap-2 text-[14px] font-medium">{b.name} <ProvenanceBadge source={b.source} /></h3>
                  <p className="text-[12px] text-muted-foreground">
                    {b.period === "weekly" ? "This week" : "This month"}: {formatShortDate(s.start, ws.locale)} to {formatShortDate(s.end, ws.locale)} · {s.pacePct}% of the way through
                  </p>
                </div>
                <Button size="icon-sm" variant="ghost" aria-label={`Edit ${b.name}`} onClick={() => open({ k: "budget", x: b })}><Pencil /></Button>
                <ConfirmDelete size="icon-sm" label={`Delete ${b.name}`} disabled={pending} title={`Delete "${b.name}"?`} description="The budget and its limits are deleted. Your transactions aren't touched." onConfirm={() => run(() => deleteBudget(b.id))} />
              </div>
              <div className="grid gap-1">
                <div className="flex items-baseline gap-2 text-[13px]">
                  <span className="text-muted-foreground">Spent</span>
                  <Amount m={s.spent} className="font-medium" />
                  <span className="text-muted-foreground">of</span>
                  <Amount m={s.limit} />
                  <span className="ml-auto text-[12px] text-muted-foreground">{Math.round(s.pct)}%</span>
                </div>
                <BudgetBar pct={s.pct} pace={s.pacePct} label={`${b.name} total`} />
              </div>
              {s.lines.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">No category limits yet. Edit the budget to add some.</p>
              ) : (
                <ul className="grid gap-3">
                  {s.lines.map((l) => (
                    <li key={l.categoryId} className="grid gap-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                        <span className="min-w-0 flex-1 truncate">{l.name}</span>
                        {l.status === "over" ? <Badge variant="danger">Over by <Amount m={absMoney(l.remaining)} /></Badge> : l.status === "watch" ? <Badge variant="warning">Ahead of pace</Badge> : null}
                        <span className="text-[12px] text-muted-foreground"><Amount m={l.spent} /> / <Amount m={l.limit} /></span>
                      </div>
                      <BudgetBar pct={l.pct} pace={s.pacePct} label={l.name} />
                    </li>
                  ))}
                </ul>
              )}
              {(s.unconverted.length > 0 || s.oldestRate) && (
                <div className="grid gap-1 text-[11px] text-muted-foreground">
                  <RateNote asOf={s.oldestRate} />
                  {s.unconverted.map((u) => (
                    <span key={u.currency}>
                      Not counted: <Amount m={u.amount} /> in {u.count} {u.currency} transaction{u.count === 1 ? "" : "s"}, because there&apos;s no {u.currency}→{b.currency} rate for those dates.
                    </span>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">Spending in a sub-category counts toward its parent&apos;s limit. Pending transactions and transfers aren&apos;t counted.</p>
    </div>
  );
}

function BudgetBar({ pct, pace, label }: { pct: number; pace: number; label: string }) {
  return (
    <div className="relative">
      <Progress value={pct} aria-label={`${label}: ${Math.round(pct)}% used`} indicatorClassName={cn(pct >= 100 ? "bg-destructive" : pct > pace + 10 ? "bg-warning" : "bg-brand")} />
      <span aria-hidden className="absolute -top-0.5 h-2.5 w-px bg-foreground/40" style={{ left: `${Math.min(100, pace)}%` }} title="Where you'd be at an even pace" />
    </div>
  );
}

/* ------------------------------------------------------------------------ */

export function BillsTab() {
  const ws = useFinance();
  const { open } = useNav();
  const { run, pending } = useServerAction();
  const hasAccounts = ws.accounts.some((a) => !a.archived_at);
  const outgoing = ws.recurring.filter((r) => r.amount.startsWith("-"));
  const subs = totalsByCurrency(outgoing.filter((r) => r.is_subscription).map((r) => monthlyEquivalent(absMoney(money(r.amount, r.currency)), r.every_n, r.unit)));
  const fixed = totalsByCurrency(outgoing.map((r) => monthlyEquivalent(absMoney(money(r.amount, r.currency)), r.every_n, r.unit)));

  if (!ws.recurring.length) {
    return (
      <Card>
        <EmptyState icon={CalendarClock} title="No bills or regular payments" action={<Button size="sm" disabled={!hasAccounts} onClick={() => open({ k: "recurring", x: null })}><Plus /> Add one</Button>}>
          {hasAccounts ? "Rent, internet, school fees, subscriptions, a salary: add anything that repeats, and record each payment when it happens. Reminders show here and on the dashboard while the app is open." : "Add an account first, so each bill knows where it's paid from."}
        </EmptyState>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start gap-3">
        {fixed.length > 0 && (
          <div className="grid gap-0.5 text-[12px] text-muted-foreground">
            <span>About {fixed.map((m, i) => <span key={m.currency}>{i > 0 && " + "}<Amount m={m} className="font-medium text-foreground" /></span>)} a month in regular payments{subs.length > 0 && <>, of which {subs.map((m, i) => <span key={m.currency}>{i > 0 && " + "}<Amount m={m} className="text-foreground" /></span>)} is subscriptions</>}.</span>
            <span className="text-[11px]">Estimate: yearly and weekly items are spread evenly across months.</span>
          </div>
        )}
        <Button size="sm" className="ml-auto" onClick={() => open({ k: "recurring", x: null })}><Plus /> New</Button>
      </div>
      <Card className="divide-y divide-border">
        {ws.recurring.map((r) => {
          const d = dueState(r.next_due_on, ws.today, r.remind_days_before);
          const a = ws.accounts.find((x) => x.id === r.account_id);
          const income = !r.amount.startsWith("-");
          return (
            <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <div className="grid min-w-0 flex-1 basis-48 gap-0.5">
                <span className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium">
                  {r.description}
                  {r.is_subscription && <Badge variant="outline">Subscription</Badge>}
                  {r.autopay && <Badge variant="outline">Autopay</Badge>}
                  <ProvenanceBadge source={r.source} />
                </span>
                <span className="text-[11px] text-muted-foreground">{every(r.every_n, r.unit)}{a ? ` · ${income ? "into" : "from"} ${a.name}` : ""}{r.ends_on ? ` · until ${dateLabel(r.ends_on, ws.today, ws.locale)}` : ""}</span>
              </div>
              <div className="grid justify-items-end gap-0.5">
                <Amount m={money(r.amount.replace(/^-/, ""), r.currency)} tone={income} className="text-[13px] font-medium" />
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  {d.state === "overdue" ? <Badge variant="danger">{-d.inDays}d overdue</Badge> : d.state === "today" ? <Badge variant="warning">Due today</Badge> : d.state === "soon" ? <Badge variant="warning">In {d.inDays}d</Badge> : null}
                  {dateLabel(r.next_due_on, ws.today, ws.locale)}
                </span>
              </div>
              <div className="flex w-full items-center justify-end gap-1 sm:w-auto">
                <Button size="sm" variant="outline" onClick={() => open({ k: "pay", x: r })}><Check /> {income ? "Received" : "Paid"}</Button>
                <Button size="icon-sm" variant="ghost" aria-label={`Skip ${r.description} to the next date`} title="Skip to the next date" disabled={pending} onClick={() => run(() => skipRecurring(r.id))}><SkipForward /></Button>
                <Button size="icon-sm" variant="ghost" aria-label={`Edit ${r.description}`} onClick={() => open({ k: "recurring", x: r })}><Pencil /></Button>
                <ConfirmDelete size="icon-sm" label={`Delete ${r.description}`} disabled={pending} title={`Delete "${r.description}"?`} description="Future reminders stop. Payments you already recorded stay in your transactions." onConfirm={() => run(() => deleteRecurring(r.id))} />
              </div>
            </div>
          );
        })}
      </Card>
      <p className="text-[11px] text-muted-foreground">Nothing is paid automatically. &ldquo;Paid&rdquo; records the transaction and moves the date on. Reminders appear in the app; they can&apos;t reach you while it&apos;s closed.</p>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

export function SavingsTab() {
  const ws = useFinance();
  const { open } = useNav();
  const { run, pending } = useServerAction();
  const debts = ws.accounts.filter((a) => a.is_liability && !a.archived_at);

  return (
    <div className="grid gap-6">
      <section className="grid gap-2">
        <SectionTitle action={<Button size="sm" onClick={() => open({ k: "savings", x: null })}><Plus /> Savings goal</Button>}>Savings</SectionTitle>
        {ws.savings.length === 0 ? (
          <Card><EmptyState compact icon={PiggyBank} title="No savings goals">An emergency fund, school fees, a trip: set a target and, if you like, link the account it&apos;s kept in.</EmptyState></Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {ws.savings.map((g) => {
              const saved = savedFor(g, ws.accounts);
              const p = savingsProgress(saved, money(g.target_amount, g.currency), ws.today, g.target_date);
              const linked = g.account_id ? ws.accounts.find((a) => a.id === g.account_id) : null;
              const goal = g.goal_id ? ws.goals.find((x) => x.id === g.goal_id) : null;
              return (
                <Card key={g.id} className="grid content-start gap-3 p-4">
                  <div className="flex items-start gap-2">
                    <div className="grid min-w-0 flex-1 gap-0.5">
                      <span className="flex flex-wrap items-center gap-1.5 text-[14px] font-medium">{g.name} <ProvenanceBadge source={g.source} /></span>
                      <span className="text-[11px] text-muted-foreground">{[linked ? `Kept in ${linked.name}` : "Updated by hand", goal ? `Goal: ${goal.title}` : null].filter(Boolean).join(" · ")}</span>
                    </div>
                    <Button size="icon-sm" variant="ghost" aria-label={`Edit ${g.name}`} onClick={() => open({ k: "savings", x: g })}><Pencil /></Button>
                    <ConfirmDelete size="icon-sm" label={`Delete ${g.name}`} disabled={pending} title={`Delete "${g.name}"?`} description="Only the goal is deleted. Accounts and transactions stay." onConfirm={() => run(() => deleteSavingsGoal(g.id))} />
                  </div>
                  <div className="flex items-baseline gap-2 text-[13px]">
                    <Amount m={saved} className="font-medium" /> <span className="text-muted-foreground">of</span> <Amount m={money(g.target_amount, g.currency)} />
                    <span className="ml-auto text-[12px] text-muted-foreground">{Math.round(p.pct)}%</span>
                  </div>
                  <Progress value={p.pct} aria-label={`${g.name}: ${Math.round(p.pct)}% saved`} indicatorClassName={p.pct >= 100 ? "bg-success" : undefined} />
                  <p className="text-[12px] text-muted-foreground">
                    {p.pct >= 100 ? "Target reached." : g.target_date
                      ? p.perMonth ? <>About <Amount m={p.perMonth} className="text-foreground" /> a month to reach it by {dateLabel(g.target_date, ws.today, ws.locale)}.</> : <>The target date has passed; <Amount m={p.remaining} className="text-foreground" /> to go.</>
                      : <><Amount m={p.remaining} className="text-foreground" /> to go.</>}
                  </p>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="grid gap-2">
        <SectionTitle action={<Button size="sm" variant="ghost" onClick={() => open({ k: "account", x: null })}><Plus /> Card or loan</Button>}>Debt</SectionTitle>
        {debts.length === 0 ? (
          <Card><EmptyState compact icon={Landmark} title="No cards or loans">Add a credit card or loan account to see what you owe and a payoff estimate.</EmptyState></Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">{debts.map((a) => <DebtCard key={a.id} a={a} />)}</div>
        )}
        <p className="text-[11px] text-muted-foreground">Pay a card or loan with a transfer from your bank account, so it&apos;s not counted as spending twice.</p>
      </section>
    </div>
  );
}

function DebtCard({ a }: { a: Account }) {
  const owed = money(a.balance.startsWith("-") ? a.balance.slice(1) : "0", a.currency);
  const [payment, setPayment] = useState("");
  const apr = a.interest_rate ? Number(a.interest_rate) : null;
  const valid = /^\d+(\.\d+)?$/.test(payment) && (payment.split(".")[1]?.length ?? 0) <= minorUnits(a.currency) && Number(payment) > 0;
  const est = valid && apr !== null ? payoffMonths(owed, apr, money(payment, a.currency)) : null;
  return (
    <Card className="grid content-start gap-3 p-4">
      <div className="grid gap-0.5">
        <span className="flex flex-wrap items-center gap-1.5 text-[14px] font-medium">{a.name} <ProvenanceBadge source={a.source} /></span>
        <span className="text-[11px] text-muted-foreground">{apr !== null ? `${apr}% a year` : "No interest rate entered"}</span>
      </div>
      <p className="text-[13px]"><Amount m={owed} className="font-display text-xl font-semibold tracking-[-0.025em]" /> <span className="text-muted-foreground">owed</span></p>
      {apr === null ? (
        <p className="text-[12px] text-muted-foreground">Add the interest rate to the account to estimate a payoff date.</p>
      ) : (
        <div className="grid gap-2">
          <Field id={`pay-${a.id}`} label={`If I pay each month (${a.currency})`}>
            <Input id={`pay-${a.id}`} inputMode="decimal" value={payment} onChange={(e) => setPayment(e.target.value.trim())} className="max-w-40" />
          </Field>
          {valid && (est ? (
            <p className="text-[12px] text-muted-foreground">
              Estimate: paid off in about <span className="font-medium text-foreground">{est.months} month{est.months === 1 ? "" : "s"}</span>, with roughly <Amount m={est.totalInterest} className="text-foreground" /> in interest. Assumes the rate stays the same and nothing new is added.
            </p>
          ) : (
            <p className="text-[12px] text-destructive">That payment doesn&apos;t cover the monthly interest, so the balance wouldn&apos;t go down.</p>
          ))}
        </div>
      )}
    </Card>
  );
}
