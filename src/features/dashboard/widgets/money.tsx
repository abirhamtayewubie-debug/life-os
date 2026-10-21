"use client";

import { Wallet } from "lucide-react";
import { EmptyState } from "@/components/data/empty-state";
import { Progress } from "@/components/ui/progress";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { DashboardModel } from "../compute";
import { WidgetCard } from "./widget-card";

export function FinanceWidget({ m, locale }: { m: DashboardModel; locale: string }) {
  const f = m.finance;
  const source = f?.accounts[0]?.source;
  return (
    <WidgetCard title="Money" description={f ? "Ledger balances from recorded transactions" : undefined} href="/finance" source={source}>
      {f ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {f.netByCurrency.map((n) => (
              <div key={n.currency} className="rounded-lg border border-border px-3 py-2.5">
                <p className="text-[11px] text-muted-foreground">Total · {n.currency}</p>
                <p className="tabular mt-0.5 text-lg font-semibold tracking-tight">{formatMoney(n, locale)}</p>
              </div>
            ))}
          </div>
          {f.netByCurrency.length > 1 && (
            <p className="-mt-2 text-[11px] text-subtle-foreground">Shown per currency. Totals are never combined without a conversion rate you set.</p>
          )}
          {f.budgets.map((b) => (
            <div key={b.id}>
              <div className="flex items-baseline justify-between">
                <p className="text-[13px] font-medium">{b.name}</p>
                <p className="tabular text-xs text-muted-foreground">
                  {formatMoney(b.spent, locale, { compact: true })} of {formatMoney(b.limit, locale, { compact: true })} · {b.pacePct}% of month gone
                </p>
              </div>
              <ul className="mt-2 space-y-2">
                {b.lines.map((l) => (
                  <li key={l.categoryName} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-3 text-xs">
                    <span className="truncate text-muted-foreground">{l.categoryName}</span>
                    <div className="relative">
                      <Progress
                        value={l.pct}
                        aria-label={`${l.categoryName} budget used`}
                        indicatorClassName={cn(l.status === "over" && "bg-destructive", l.status === "watch" && "bg-warning")}
                      />
                      <span className="absolute -top-0.5 h-2.5 w-px bg-foreground/40" style={{ left: `${b.pacePct}%` }} aria-hidden title="Month elapsed" />
                    </div>
                    <span className={cn("tabular text-right", l.status === "over" && "text-destructive")}>{Math.round(l.pct)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {f.monthSpendByCurrency.length > 0 && (
            <p className="border-t border-border pt-2.5 text-xs text-muted-foreground">
              Spent this month: <span className="tabular text-foreground">{f.monthSpendByCurrency.map((s) => formatMoney(s, locale)).join(" + ")}</span>
            </p>
          )}
        </div>
      ) : (
        <EmptyState compact icon={Wallet} title="No accounts yet">
          Add a wallet or bank account and record transactions by hand. No bank connection is required.
        </EmptyState>
      )}
    </WidgetCard>
  );
}
