"use client";

import { FileBarChart } from "lucide-react";
import { EmptyState } from "@/components/data/empty-state";
import { Card } from "@/components/ui/card";
import { toMinor } from "@/lib/money";
import { cn } from "@/lib/utils";
import { isNegative, isZero, monthlyReport, shiftMonth } from "./ledger";
import { Amount, useFinance, useNav } from "./shared";
import { MonthStepper, monthLabel } from "./transactions";

export function ReportTab() {
  const ws = useFinance();
  const { go } = useNav();
  const blocks = monthlyReport(ws.recent, ws.categories, ws.reportMonth);
  const pending = ws.recent.filter((t) => t.is_pending && t.occurred_on.startsWith(ws.reportMonth)).length;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <MonthStepper label="Report month" value={ws.reportMonth} max={ws.today.slice(0, 7)} onChange={(m) => go({ report: m })} />
        <p className="ml-auto text-[11px] text-muted-foreground">Compared with {monthLabel(shiftMonth(ws.reportMonth, -1), ws.locale)}</p>
      </div>

      {blocks.length === 0 ? (
        <Card><EmptyState icon={FileBarChart} title={`Nothing recorded in ${monthLabel(ws.reportMonth, ws.locale)}`}>The report fills in from your income and spending. Transfers between your own accounts aren&apos;t counted.</EmptyState></Card>
      ) : blocks.map((b) => {
        const income = b.byCategory.filter((c) => c.kind === "income");
        const spend = b.byCategory.filter((c) => c.kind === "expense");
        const biggest = spend.reduce((m, c) => (toMinor(c.amount.amount, b.currency) > m ? toMinor(c.amount.amount, b.currency) : m), 0n);
        return (
          <Card key={b.currency} className="grid gap-5 p-5">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Income"><Amount m={b.income} tone /></Stat>
              <Stat label="Spending"><Amount m={b.expenses} /></Stat>
              <Stat label="Left over"><Amount m={b.net} signed className={cn(isNegative(b.net) && "text-destructive")} /></Stat>
              <Stat label="Kept">{b.savingsRate === null ? <span className="text-muted-foreground">No income</span> : `${b.savingsRate}%`}</Stat>
            </div>
            {blocks.length > 1 && <p className="-mt-3 text-[11px] text-muted-foreground">Everything in {b.currency}. Each currency has its own report.</p>}

            {spend.length > 0 && (
              <section className="grid gap-2">
                <h3 className="label-caps">Where it went</h3>
                <ul className="grid gap-2">
                  {spend.map((c) => {
                    const v = toMinor(c.amount.amount, b.currency);
                    return (
                      <li key={c.categoryId ?? "none"} className="grid gap-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                          <span className="min-w-0 flex-1 truncate">{c.name}</span>
                          <Change m={c.change} previousZero={isZero(c.previous)} spending />
                          <Amount m={c.amount} className="font-medium" />
                        </div>
                        <div className="h-1.5 rounded-full bg-muted" aria-hidden>
                          <div className="h-full rounded-full bg-brand" style={{ width: `${biggest > 0n ? Number((v * 1000n) / biggest) / 10 : 0}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {income.length > 0 && (
              <section className="grid gap-2">
                <h3 className="label-caps">Where it came from</h3>
                <ul className="grid gap-1.5">
                  {income.map((c) => (
                    <li key={c.categoryId ?? "none"} className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      <Change m={c.change} previousZero={isZero(c.previous)} />
                      <Amount m={c.amount} tone className="font-medium" />
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <p className="text-[11px] text-muted-foreground">{b.count} transaction{b.count === 1 ? "" : "s"}. Sub-categories are added into their parent.</p>
          </Card>
        );
      })}
      {pending > 0 && <p className="text-[11px] text-muted-foreground">{pending} pending transaction{pending === 1 ? " isn't" : "s aren't"} included until marked as cleared.</p>}
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <span className="label-caps">{label}</span>
      <span className="font-display text-[22px] leading-tight font-normal tracking-[-0.01em]">{children}</span>
    </div>
  );
}

function Change({ m, previousZero, spending = false }: { m: { amount: string; currency: string }; previousZero: boolean; spending?: boolean }) {
  if (previousZero) return <span className="text-[11px] text-muted-foreground">new</span>;
  if (isZero(m)) return <span className="text-[11px] text-muted-foreground">same as last month</span>;
  const up = !isNegative(m);
  return (
    <span className={cn("text-[11px]", spending ? "text-muted-foreground" : up ? "text-success" : "text-muted-foreground")}>
      <Amount m={m} signed /> vs last month
    </span>
  );
}
