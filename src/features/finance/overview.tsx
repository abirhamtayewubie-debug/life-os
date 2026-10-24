"use client";

import { ArrowLeftRight, Landmark, Plus, Receipt } from "lucide-react";
import { EmptyState } from "@/components/data/empty-state";
import { ProvenanceBadge } from "@/components/data/provenance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatShortDate, relativeDay } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { budgetStatus, dueState, monthlyReport, netWorth } from "./ledger";
import { Amount, RateNote, SectionTitle, money, useFinance, useNav } from "./shared";
import { ACCOUNT_KIND_LABEL } from "./types";

export function Overview() {
  const ws = useFinance();
  const { open, go } = useNav();
  const accounts = ws.accounts.filter((a) => !a.archived_at);

  if (!accounts.length) {
    return (
      <Card>
        <EmptyState icon={Landmark} title="Add your first account" action={<Button size="sm" onClick={() => open({ k: "account", x: null })}><Plus /> Add an account</Button>}>
          Start with where your money is: a bank account, cash, mobile money, a card or a loan. Each account keeps its own currency, and nothing is converted unless you enter a rate.
        </EmptyState>
      </Card>
    );
  }

  const nw = netWorth(accounts, ws.baseCurrency, ws.rates, ws.today);
  const month = ws.today.slice(0, 7);
  const report = monthlyReport(ws.recent, ws.categories, month);
  const bills = ws.recurring
    .map((r) => ({ r, d: dueState(r.next_due_on, ws.today, r.remind_days_before) }))
    .filter(({ d }) => d.inDays <= 14)
    .slice(0, 6);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="grid min-w-0 content-start gap-5">
        <Card className="grid gap-3 p-5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-[12px] text-muted-foreground">Net worth in {ws.baseCurrency}</p>
            <RateNote asOf={nw.oldestRate} className="ml-auto" />
          </div>
          {nw.total ? (
            <p className="font-display text-[32px] leading-none sm:text-[40px] font-normal tracking-[-0.01em]"><Amount m={nw.total} /></p>
          ) : (
            <p className="text-[13px] text-muted-foreground">No total yet. Add an exchange rate to {ws.baseCurrency} to combine your currencies.</p>
          )}
          {nw.total && (
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-muted-foreground">
              <span>Own <Amount m={nw.assets} className="text-foreground" /></span>
              <span>Owe <Amount m={nw.liabilities} className="text-foreground" /></span>
            </div>
          )}
          {nw.missing.length > 0 && (
            <div className="rounded-md border border-dashed border-border p-3 text-[12px] text-muted-foreground">
              Not included, because there&apos;s no rate to {ws.baseCurrency} yet:{" "}
              {nw.missing.map((m, i) => <span key={m.currency}>{i > 0 && ", "}<Amount m={m.amount} className="text-foreground" /></span>)}.{" "}
              <button type="button" className="cursor-pointer text-foreground underline underline-offset-2" onClick={() => open({ k: "rate", x: null })}>Add a rate</button>
            </div>
          )}
        </Card>

        <section className="grid gap-2">
          <SectionTitle action={<>
            <Button size="sm" variant="ghost" onClick={() => open({ k: "transfer" })}><ArrowLeftRight /> Transfer</Button>
            <Button size="sm" onClick={() => open({ k: "tx", x: null })}><Plus /> Transaction</Button>
          </>}>Accounts</SectionTitle>
          <Card className="divide-y divide-border">
            {accounts.map((a) => (
              <button key={a.id} type="button" onClick={() => go({ tab: "transactions", account: a.id, month: null, category: null, q: null })} className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-muted/50">
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
                    <span className="truncate">{a.name}</span>
                    <ProvenanceBadge source={a.source} />
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {ACCOUNT_KIND_LABEL[a.kind]}{a.institution ? ` · ${a.institution}` : ""}
                    {a.last_transaction_on ? ` · last entry ${relativeDay(a.last_transaction_on, ws.today).toLowerCase()}` : " · no entries yet"}
                  </span>
                </span>
                <span className="grid justify-items-end">
                  <Amount m={money(a.is_liability ? a.balance.replace(/^-/, "") : a.balance, a.currency)} className="text-[14px] font-medium" />
                  {a.is_liability && <span className="text-[11px] text-muted-foreground">owed</span>}
                </span>
              </button>
            ))}
          </Card>
          <p className="text-[11px] text-muted-foreground">Balances are your opening balance plus what you&apos;ve recorded. Pending entries aren&apos;t counted yet.</p>
        </section>
      </div>

      <div className="grid min-w-0 content-start gap-5">
        <section className="grid gap-2">
          <SectionTitle action={<Button size="sm" variant="ghost" onClick={() => go({ tab: "report", report: null })}>Report</Button>}>This month</SectionTitle>
          <Card className="grid gap-3 p-4">
            {report.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Nothing recorded this month yet.</p>
            ) : report.map((r) => (
              <div key={r.currency} className="grid grid-cols-3 gap-2 text-[12px]">
                <span className="grid gap-0.5"><span className="text-muted-foreground">In</span><Amount m={r.income} tone className="text-[14px] font-medium" /></span>
                <span className="grid gap-0.5"><span className="text-muted-foreground">Out</span><Amount m={r.expenses} className="text-[14px] font-medium" /></span>
                <span className="grid gap-0.5"><span className="text-muted-foreground">Left</span><Amount m={r.net} signed className="text-[14px] font-medium" /></span>
              </div>
            ))}
            {report.length > 1 && <p className="text-[11px] text-muted-foreground">Shown per currency; currencies are never added together without a rate.</p>}
          </Card>
        </section>

        {ws.budgets.length > 0 && (
          <section className="grid gap-2">
            <SectionTitle action={<Button size="sm" variant="ghost" onClick={() => go({ tab: "budgets" })}>All budgets</Button>}>Budgets</SectionTitle>
            <Card className="grid gap-3 p-4">
              {ws.budgets.map((b) => {
                const s = budgetStatus(b, b.lines, ws.recent, ws.categories, ws.rates, ws.today, ws.weekStart);
                const over = s.lines.filter((l) => l.status === "over").length;
                return (
                  <div key={b.id} className="grid gap-1.5">
                    <div className="flex items-baseline gap-2 text-[13px]">
                      <span className="min-w-0 flex-1 truncate">{b.name}</span>
                      <span className="text-[12px] text-muted-foreground"><Amount m={s.spent} /> of <Amount m={s.limit} /></span>
                    </div>
                    <Progress value={s.pct} aria-label={`${b.name}: ${Math.round(s.pct)}% used`} indicatorClassName={cn(s.pct >= 100 ? "bg-destructive" : s.pct > s.pacePct + 10 ? "bg-warning" : "bg-brand")} />
                    {over > 0 && <span className="text-[11px] text-destructive">{over} categor{over === 1 ? "y is" : "ies are"} over</span>}
                  </div>
                );
              })}
            </Card>
          </section>
        )}

        <section className="grid gap-2">
          <SectionTitle action={<Button size="sm" variant="ghost" onClick={() => go({ tab: "bills" })}>All bills</Button>}>Coming up</SectionTitle>
          <Card className="divide-y divide-border">
            {bills.length === 0 ? (
              <EmptyState compact icon={Receipt} title="Nothing due in the next two weeks" />
            ) : bills.map(({ r, d }) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="truncate text-[13px]">{r.description}</span>
                  <span className="text-[11px] text-muted-foreground">{formatShortDate(r.next_due_on, ws.locale)}</span>
                </span>
                {d.state === "overdue" ? <Badge variant="danger">Overdue</Badge> : d.state === "today" ? <Badge variant="warning">Today</Badge> : <span className="text-[11px] text-muted-foreground">in {d.inDays}d</span>}
                <Amount m={money(r.amount.replace(/^-/, ""), r.currency)} className="text-[13px]" />
              </div>
            ))}
          </Card>
        </section>
      </div>
    </div>
  );
}
