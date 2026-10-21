"use client";

import { Archive, ArchiveRestore, ArrowRightLeft, Pencil, Plus, Tags } from "lucide-react";
import { ConfirmDelete } from "@/components/data/confirm-delete";
import { EmptyState } from "@/components/data/empty-state";
import { ProvenanceBadge } from "@/components/data/provenance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { addDefaultCategories, deleteAccount, deleteCategory, deleteRate, setAccountArchived } from "@/server/actions/finance";
import { useServerAction } from "@/features/dashboard/use-server-action";
import { Amount, SectionTitle, dateLabel, money, useFinance, useNav } from "./shared";
import { ACCOUNT_KIND_LABEL, type Category } from "./types";

export function SetupTab() {
  const ws = useFinance();
  const { open } = useNav();
  const { run, pending } = useServerAction();
  const accounts = [...ws.accounts].sort((a, b) => Number(!!a.archived_at) - Number(!!b.archived_at));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="grid content-start gap-2 lg:col-span-2">
        <SectionTitle action={<Button size="sm" onClick={() => open({ k: "account", x: null })}><Plus /> Account</Button>}>Accounts</SectionTitle>
        {accounts.length === 0 ? (
          <Card><EmptyState compact title="No accounts yet">Add a bank account, cash, mobile money, a card or a loan.</EmptyState></Card>
        ) : (
          <Card className="divide-y divide-border">
            {accounts.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <div className="grid min-w-0 flex-1 basis-48 gap-0.5">
                  <span className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium">
                    {a.name}
                    {a.archived_at && <Badge variant="outline">Closed</Badge>}
                    {!a.include_in_net_worth && <Badge variant="outline">Not in net worth</Badge>}
                    <ProvenanceBadge source={a.source} />
                  </span>
                  <span className="text-[11px] text-muted-foreground">{ACCOUNT_KIND_LABEL[a.kind]} · {a.currency}{a.institution ? ` · ${a.institution}` : ""} · opened {dateLabel(a.opening_date, ws.today, ws.locale)}</span>
                </div>
                <Amount m={money(a.is_liability ? a.balance.replace(/^-/, "") : a.balance, a.currency)} className="text-[13px]" />
                <div className="flex items-center gap-0.5">
                  <Button size="icon-sm" variant="ghost" aria-label={`Edit ${a.name}`} onClick={() => open({ k: "account", x: a })}><Pencil /></Button>
                  <Button size="icon-sm" variant="ghost" disabled={pending} aria-label={a.archived_at ? `Reopen ${a.name}` : `Close ${a.name}`} title={a.archived_at ? "Reopen" : "Close (keeps its history)"}
                    onClick={() => run(() => setAccountArchived(a.id, !a.archived_at))}>{a.archived_at ? <ArchiveRestore /> : <Archive />}</Button>
                  <ConfirmDelete size="icon-sm" label={`Delete ${a.name}`} disabled={pending} title={`Delete "${a.name}"?`} confirmLabel="Delete account and history"
                    description={a.last_transaction_on
                      ? "This deletes the account, every transaction recorded in it (including both sides of any transfers) and its bills. If you've just stopped using it, close it instead to keep the history."
                      : "This account has no transactions. Bills and savings goals linked to it are removed or unlinked."}
                    onConfirm={() => run(() => deleteAccount(a.id))} />
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>

      <section className="grid content-start gap-2">
        <SectionTitle action={<Button size="sm" variant="ghost" onClick={() => open({ k: "category", x: null })}><Plus /> Category</Button>}>Categories</SectionTitle>
        {ws.categories.length === 0 ? (
          <Card>
            <EmptyState compact icon={Tags} title="No categories yet" action={<Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => addDefaultCategories())}>Add a starter set</Button>}>
              A starter set of 14 common categories you can rename or remove, or add your own.
            </EmptyState>
          </Card>
        ) : (
          <Card className="grid gap-4 p-4">
            {(["expense", "income"] as const).map((kind) => (
              <CategoryGroup key={kind} kind={kind} cats={ws.categories.filter((c) => c.kind === kind)} />
            ))}
          </Card>
        )}
      </section>

      <section className="grid content-start gap-2">
        <SectionTitle action={<Button size="sm" variant="ghost" onClick={() => open({ k: "rate", x: null })}><Plus /> Rate</Button>}>Exchange rates</SectionTitle>
        <p className="text-[12px] text-muted-foreground">
          Your own rates, used to show totals in {ws.baseCurrency} and to count foreign spending in budgets. Nothing is fetched online. Each conversion uses the newest rate on or before the transaction&apos;s date.
        </p>
        {ws.rates.length === 0 ? (
          <Card><EmptyState compact icon={ArrowRightLeft} title="No rates yet">Until you add one, each currency is shown on its own.</EmptyState></Card>
        ) : (
          <Card className="divide-y divide-border">
            {ws.rates.slice(0, 50).map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                <span className="min-w-0 flex-1">1 {r.base} = <span className="tabular font-medium">{Number(r.rate).toLocaleString(ws.locale, { maximumFractionDigits: 10 })}</span> {r.quote}</span>
                <ProvenanceBadge source={r.source} />
                <span className="text-[11px] text-muted-foreground">{dateLabel(r.as_of, ws.today, ws.locale)}</span>
                <Button size="icon-sm" variant="ghost" className="size-6" aria-label={`Edit ${r.base} to ${r.quote} rate`} onClick={() => open({ k: "rate", x: r })}><Pencil /></Button>
                <ConfirmDelete size="icon-sm" label={`Delete ${r.base} to ${r.quote} rate`} disabled={pending} title="Delete this rate?" description="Totals and budgets that used it will use an older rate, or leave those amounts out." onConfirm={() => run(() => deleteRate(r.id))} />
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

function CategoryGroup({ kind, cats }: { kind: "income" | "expense"; cats: Category[] }) {
  const { open } = useNav();
  const { run, pending } = useServerAction();
  const tops = cats.filter((c) => !c.parent_id).sort((a, b) => a.name.localeCompare(b.name));
  const row = (c: Category, sub: boolean) => (
    <li key={c.id} className={`group flex items-center gap-2 py-1 text-[13px] ${sub ? "pl-5 text-muted-foreground" : ""}`}>
      <span className="min-w-0 flex-1 truncate">{sub ? "› " : ""}{c.name}</span>
      <ProvenanceBadge source={c.source} />
      <span className="flex items-center gap-0.5 pointer-fine:opacity-0 pointer-fine:group-focus-within:opacity-100 pointer-fine:group-hover:opacity-100">
        <Button size="icon-sm" variant="ghost" className="size-6 text-muted-foreground" aria-label={`Edit ${c.name}`} onClick={() => open({ k: "category", x: c })}><Pencil /></Button>
        <ConfirmDelete size="icon-sm" label={`Delete ${c.name}`} disabled={pending} title={`Delete "${c.name}"?`}
          description={sub ? "Its transactions become uncategorised, and any budget limit for it is removed." : "Its transactions become uncategorised. Its sub-categories and any budget limits for it are deleted too."}
          onConfirm={() => run(() => deleteCategory(c.id))} />
      </span>
    </li>
  );
  return (
    <div className="grid gap-1">
      <h3 className="text-[11px] font-medium text-muted-foreground uppercase">{kind === "expense" ? "Spending" : "Income"}</h3>
      {tops.length === 0 ? <p className="text-[12px] text-muted-foreground">None yet.</p> : (
        <ul>{tops.flatMap((t) => [row(t, false), ...cats.filter((c) => c.parent_id === t.id).sort((a, b) => a.name.localeCompare(b.name)).map((c) => row(c, true))])}</ul>
      )}
    </div>
  );
}
