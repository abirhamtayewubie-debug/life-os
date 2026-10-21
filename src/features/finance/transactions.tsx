"use client";

import { useState } from "react";
import { ArrowLeftRight, ChevronLeft, ChevronRight, Download, Pencil, Plus, Search, Upload, Wallet } from "lucide-react";
import { ConfirmDelete } from "@/components/data/confirm-delete";
import { EmptyState } from "@/components/data/empty-state";
import { ProvenanceBadge } from "@/components/data/provenance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
import { formatShortDate } from "@/lib/dates";
import { totalsByCurrency } from "@/lib/money";
import { deleteTransaction } from "@/server/actions/finance";
import { useServerAction } from "@/features/dashboard/use-server-action";
import { shiftMonth } from "./ledger";
import { Amount, money, useFinance, useNav } from "./shared";
import type { Transaction } from "./types";

export function monthLabel(monthKey: string, locale: string) {
  const [y, m] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(Date.UTC(y, m - 1, 1)));
}

export function MonthStepper({ value, max, onChange, label }: { value: string; max: string; onChange: (m: string) => void; label: string }) {
  const ws = useFinance();
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <Button size="icon-sm" variant="ghost" aria-label="Previous month" onClick={() => onChange(shiftMonth(value, -1))}><ChevronLeft /></Button>
      <span className="min-w-32 text-center text-[13px] font-medium">{monthLabel(value, ws.locale)}</span>
      <Button size="icon-sm" variant="ghost" aria-label="Next month" disabled={value >= max} onClick={() => onChange(shiftMonth(value, 1))}><ChevronRight /></Button>
    </div>
  );
}

export function TransactionsTab() {
  const ws = useFinance();
  const { open, go } = useNav();
  const { run, pending } = useServerAction();
  const f = ws.filters;
  const [q, setQ] = useState(f.q ?? "");
  const hasAccounts = ws.accounts.some((a) => !a.archived_at);
  const acct = new Map(ws.accounts.map((a) => [a.id, a]));
  const cat = new Map(ws.categories.map((c) => [c.id, c]));
  const filtered = !!(f.account || f.category || f.q);

  // Totals for what's shown: real income and spending only, per currency.
  const shown = ws.list.filter((t) => !t.is_pending && (t.kind === "income" || t.kind === "expense"));
  const inn = totalsByCurrency(shown.filter((t) => t.kind === "income").map((t) => money(t.amount, t.currency)));
  const out = totalsByCurrency(shown.filter((t) => t.kind === "expense").map((t) => money(t.amount.replace(/^-/, ""), t.currency)));

  const days = new Map<string, Transaction[]>();
  for (const t of ws.list) days.set(t.occurred_on, [...(days.get(t.occurred_on) ?? []), t]);

  const exportHref = `/finance/export?${new URLSearchParams({ month: f.month, ...(f.account ? { account: f.account } : {}), ...(f.category ? { category: f.category } : {}), ...(f.q ? { q: f.q } : {}) }).toString()}`;

  const describe = (t: Transaction) => {
    if (t.kind === "transfer") {
      const other = ws.list.find((o) => o.transfer_group_id === t.transfer_group_id && o.id !== t.id) ?? ws.recent.find((o) => o.transfer_group_id === t.transfer_group_id && o.id !== t.id);
      const name = other ? acct.get(other.account_id)?.name : null;
      return t.description || (name ? (t.amount.startsWith("-") ? `Transfer to ${name}` : `Transfer from ${name}`) : "Transfer");
    }
    if (t.kind === "adjustment") return t.description || "Balance correction";
    return t.description || t.payee || (t.category_id ? cat.get(t.category_id)?.name : null) || (t.kind === "income" ? "Money in" : "Money out");
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <MonthStepper label="Month" value={f.month} max={ws.today.slice(0, 7)} onChange={(m) => go({ month: m })} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => open({ k: "import" })} disabled={!hasAccounts}><Upload /> Import</Button>
          <Button size="sm" variant="ghost" asChild><a href={exportHref} download><Download /> Export</a></Button>
          <Button size="sm" variant="outline" onClick={() => open({ k: "transfer" })} disabled={ws.accounts.filter((a) => !a.archived_at).length < 2}><ArrowLeftRight /> Transfer</Button>
          <Button size="sm" onClick={() => open(hasAccounts ? { k: "tx", x: null } : { k: "account", x: null })}><Plus /> {hasAccounts ? "Transaction" : "Account"}</Button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)]">
        <NativeSelect aria-label="Account" value={f.account ?? ""} onChange={(e) => go({ account: e.target.value })}>
          <option value="">All accounts</option>
          {ws.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.archived_at ? " (closed)" : ""}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Category" value={f.category ?? ""} onChange={(e) => go({ category: e.target.value })}>
          <option value="">All categories</option>
          <option value="none">Uncategorised</option>
          {ws.categories.map((c) => <option key={c.id} value={c.id}>{c.parent_id ? `${cat.get(c.parent_id)?.name ?? ""} › ` : ""}{c.name}</option>)}
        </NativeSelect>
        <form role="search" className="relative" onSubmit={(e) => { e.preventDefault(); go({ q: q.trim() || null }); }}>
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input aria-label="Search descriptions, payees and notes" placeholder="Search and press Enter" className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
      </div>

      {(inn.length > 0 || out.length > 0) && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-muted-foreground">
          <span>In: {inn.length ? inn.map((m, i) => <span key={m.currency}>{i > 0 && " · "}<Amount m={m} tone /></span>) : "nothing"}</span>
          <span>Out: {out.length ? out.map((m, i) => <span key={m.currency}>{i > 0 && " · "}<Amount m={m} className="text-foreground" /></span>) : "nothing"}</span>
          <span className="text-[11px]">Transfers and corrections aren&apos;t counted as income or spending.</span>
        </div>
      )}

      {ws.list.length === 0 ? (
        <Card>
          <EmptyState icon={Wallet} title={filtered ? "Nothing matches" : `Nothing recorded in ${monthLabel(f.month, ws.locale)}`}
            action={filtered ? <Button size="sm" variant="outline" onClick={() => { setQ(""); go({ account: null, category: null, q: null }); }}>Clear filters</Button> : hasAccounts ? <Button size="sm" onClick={() => open({ k: "tx", x: null })}><Plus /> Add a transaction</Button> : undefined}>
            {filtered ? "Try another month or clear the filters." : hasAccounts ? "Add what you spend and earn by hand, or import a CSV statement from your bank." : "Add an account first, then record what goes in and out of it."}
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-3">
          {[...days.entries()].map(([day, txs]) => (
            <section key={day} className="grid gap-1">
              <h3 className="px-1 text-[11px] font-medium text-muted-foreground uppercase">{formatShortDate(day, ws.locale)}</h3>
              <Card className="divide-y divide-border">
                {txs.map((t) => {
                  const a = acct.get(t.account_id);
                  const c = t.category_id ? cat.get(t.category_id) : null;
                  return (
                    <div key={t.id} className="group flex items-center gap-3 px-4 py-2.5">
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className="flex flex-wrap items-center gap-1.5 text-[13px]">
                          <span className="truncate">{describe(t)}</span>
                          {t.is_pending && <Badge variant="outline">Pending</Badge>}
                          <ProvenanceBadge source={t.source} />
                        </span>
                        <span className="truncate text-[11px] text-muted-foreground">
                          {[a?.name, t.kind === "transfer" ? "Transfer" : t.kind === "adjustment" ? "Correction" : c ? (c.parent_id ? `${cat.get(c.parent_id)?.name ?? ""} › ${c.name}` : c.name) : "Uncategorised", t.payee && t.description ? t.payee : null].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <Amount m={money(t.amount, t.currency)} signed tone={t.kind === "income"} className="text-[13px] font-medium" />
                      <span className="flex items-center gap-0.5 pointer-fine:opacity-0 pointer-fine:group-focus-within:opacity-100 pointer-fine:group-hover:opacity-100">
                        {t.kind !== "transfer" && (
                          <Button size="icon-sm" variant="ghost" className="size-6 text-muted-foreground" aria-label="Edit transaction" onClick={() => open({ k: "tx", x: t })}><Pencil /></Button>
                        )}
                        <ConfirmDelete size="icon-sm" label="Delete transaction" disabled={pending}
                          title={t.kind === "transfer" ? "Delete this transfer?" : "Delete this transaction?"}
                          description={t.kind === "transfer" ? "Both sides of the transfer are deleted, so both account balances change back." : "The account balance changes back. This can't be undone."}
                          onConfirm={() => run(() => deleteTransaction(t.id))} />
                      </span>
                    </div>
                  );
                })}
              </Card>
            </section>
          ))}
          {ws.listTruncated && <p className="text-[12px] text-muted-foreground">Showing the latest 500. Narrow it with an account, category or search to see the rest.</p>}
        </div>
      )}
    </div>
  );
}
