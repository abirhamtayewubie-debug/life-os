"use client";

import {
  ArrowLeftRight, Briefcase, Car, Coffee, GraduationCap, HeartPulse, Home, Landmark, Plus, Receipt, Repeat, Shirt,
  ShoppingCart, TrendingUp, Users, Zap, type LucideIcon,
} from "lucide-react";
import { EmptyState } from "@/components/data/empty-state";
import { ProvenanceBadge } from "@/components/data/provenance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatShortDate, relativeDay } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { budgetStatus, dueState, monthlyReport, netWorth, type CurrencyReport } from "./ledger";
import { Amount, RateNote, money, useFinance, useNav } from "./shared";
import { ACCOUNT_KIND_LABEL, type Transaction } from "./types";
import { formatMoney, type Money } from "@/lib/money";

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

  const block = report.find((r) => r.currency === ws.baseCurrency) ?? report[0];

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
      <BalanceCard total={nw.total} label={`Total balance${nw.total ? ` in ${ws.baseCurrency}` : ""}`} block={block} />
      <SpendingCard block={block} monthKey={month} />

      {nw.missing.length > 0 && (
        <div className="rounded-[22px] border border-dashed border-border p-4 text-[12px] text-muted-foreground lg:col-span-2">
          Not included in the total, because there&apos;s no rate to {ws.baseCurrency} yet:{" "}
          {nw.missing.map((m, i) => <span key={m.currency}>{i > 0 && ", "}<Amount m={m.amount} className="text-foreground" /></span>)}.{" "}
          <button type="button" className="cursor-pointer text-foreground underline underline-offset-2" onClick={() => open({ k: "rate", x: null })}>Add a rate</button>
        </div>
      )}
      {nw.total && nw.oldestRate && <RateNote asOf={nw.oldestRate} className="-mt-1 lg:col-span-2" />}

      {ws.budgets.length > 0 && (
        <ClaySection title="Budgets" action={<Button size="sm" variant="ghost" onClick={() => go({ tab: "budgets" })}>All budgets</Button>}>
          <Card className="grid gap-5 rounded-[24px] p-5">
            {ws.budgets.map((b) => {
              const st = budgetStatus(b, b.lines, ws.recent, ws.categories, ws.rates, ws.today, ws.weekStart);
              const over = st.lines.filter((l) => l.status === "over").length;
              return (
                <div key={b.id} className="grid gap-2">
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate font-display text-[16px]">{b.name}</span>
                    <span className="text-[12px] text-muted-foreground"><Amount m={st.spent} /> of <Amount m={st.limit} /></span>
                  </div>
                  <Progress value={st.pct} className="h-1" aria-label={`${b.name}: ${Math.round(st.pct)}% used`} indicatorClassName={cn(st.pct >= 100 ? "bg-destructive" : st.pct > st.pacePct + 10 ? "bg-gold" : "bg-sage")} />
                  {over > 0 && <span className="text-[11px] text-destructive">{over} categor{over === 1 ? "y is" : "ies are"} over</span>}
                </div>
              );
            })}
          </Card>
        </ClaySection>
      )}

      <Recent />

      <ClaySection title="Accounts" action={<>
        <Button size="sm" variant="ghost" onClick={() => open({ k: "transfer" })}><ArrowLeftRight /> Transfer</Button>
        <Button size="sm" onClick={() => open({ k: "tx", x: null })}><Plus /> Transaction</Button>
      </>}>
        <Card className="divide-y divide-border rounded-[24px]">
          {accounts.map((a) => (
            <button key={a.id} type="button" onClick={() => go({ tab: "transactions", account: a.id, month: null, category: null, q: null })} className="flex min-h-14 w-full cursor-pointer items-center gap-3 px-5 py-3 text-left first:rounded-t-[24px] last:rounded-b-[24px] hover:bg-tint-mist/50">
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-display text-[16px]">{a.name}</span>
                  <ProvenanceBadge source={a.source} />
                </span>
                <span className="text-[12px] text-muted-foreground">
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
      </ClaySection>

      <ClaySection title="Coming up" action={<Button size="sm" variant="ghost" onClick={() => go({ tab: "bills" })}>All bills</Button>}>
        <Card className="divide-y divide-border rounded-[24px]">
          {bills.length === 0 ? (
            <EmptyState compact icon={Receipt} title="Nothing due in the next two weeks" />
          ) : bills.map(({ r, d }) => (
            <div key={r.id} className="flex items-center gap-3 px-5 py-3">
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="truncate font-display text-[16px]">{r.description}</span>
                <span className="text-[12px] text-muted-foreground">{formatShortDate(r.next_due_on, ws.locale)}</span>
              </span>
              {d.state === "overdue" ? <Badge variant="danger">Overdue</Badge> : d.state === "today" ? <Badge variant="warning">Today</Badge> : <span className="text-[12px] text-muted-foreground">in {d.inDays}d</span>}
              <Amount m={money(r.amount.replace(/^-/, ""), r.currency)} className="text-[14px]" />
            </div>
          ))}
        </Card>
      </ClaySection>
    </div>
  );
}

function ClaySection({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid min-w-0 content-start gap-2.5">
      <div className="flex min-h-9 items-center gap-2">
        <h2 className="label-caps font-sans">{title}</h2>
        {action && <div className="ml-auto flex items-center gap-1">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** "$12,480" with ".50" smaller and dimmer, in the viewer's locale. */
function BigMoney({ m }: { m: Money }) {
  const ws = useFinance();
  const parts = new Intl.NumberFormat(ws.locale, {
    style: "currency", currency: m.currency, currencyDisplay: m.currency === "ETB" ? "code" : "narrowSymbol",
  }).formatToParts(Number(m.amount));
  const at = parts.findIndex((p) => p.type === "decimal");
  const whole = (at === -1 ? parts : parts.slice(0, at)).map((p) => p.value).join("");
  const cents = at === -1 ? "" : parts.slice(at).map((p) => p.value).join("");
  return (
    <span className="tabular whitespace-nowrap">
      {whole}
      {cents && <span className="text-[0.5em] opacity-60">{cents}</span>}
    </span>
  );
}

/** Ink card (cream in night mode) with the total, and this month's money in and out. */
function BalanceCard({ total, label, block }: { total: Money | null; label: string; block: CurrencyReport | undefined }) {
  const ws = useFinance();
  // Whole units keep the pills readable on phones; exact figures are one tap away in the report.
  const whole = (m: Money) => new Intl.NumberFormat(ws.locale, {
    style: "currency", currency: m.currency, currencyDisplay: m.currency === "ETB" ? "code" : "narrowSymbol", maximumFractionDigits: 0,
  }).format(Math.abs(Number(m.amount)));
  return (
    <section aria-label="Total balance" className="relative overflow-hidden rounded-[28px] bg-inverse p-6 text-inverse-foreground shadow-clay sm:p-7">
      <span className="pointer-events-none absolute -top-16 -right-14 size-52 rounded-full bg-sage opacity-[0.22]" aria-hidden />
      <p className="relative font-display text-[15px] text-inverse-muted italic">{label}</p>
      <p className="relative mt-1 font-display text-[40px] leading-tight font-light sm:text-[44px]">
        {total ? <BigMoney m={total} /> : <span className="text-[18px]">Add a rate to combine your currencies</span>}
      </p>
      {block && (
        <div className="relative mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-[18px] bg-sage px-3.5 py-3 sm:px-4 text-[#fbf8f1]">
            <p className="text-[11px] font-medium tracking-[0.16em] uppercase opacity-85">In</p>
            <p className="mt-0.5 truncate font-display text-[clamp(14px,4.4vw,20px)]">+{whole(block.income)}</p>
          </div>
          <div className="rounded-[18px] bg-clay px-3.5 py-3 sm:px-4 text-[#fbf8f1]">
            <p className="text-[11px] font-medium tracking-[0.16em] uppercase opacity-85">Out</p>
            <p className="mt-0.5 truncate font-display text-[clamp(14px,4.4vw,20px)]">−{whole(block.expenses)}</p>
          </div>
        </div>
      )}
    </section>
  );
}

const DONUT = ["var(--clay)", "var(--sage)", "var(--stone)", "var(--gold)"];

/** This month's spending by top category: a donut with the total in the middle and a legend. */
function SpendingCard({ block, monthKey }: { block: CurrencyReport | undefined; monthKey: string }) {
  const ws = useFinance();
  const { go } = useNav();
  const spent = block ? block.byCategory.filter((c) => c.kind === "expense" && Number(c.amount.amount) > 0).sort((a, b) => Number(b.amount.amount) - Number(a.amount.amount)) : [];
  const total = spent.reduce((a, c) => a + Number(c.amount.amount), 0);
  const top = spent.slice(0, 3).map((c) => ({ name: c.name, value: Number(c.amount.amount) }));
  const rest = total - top.reduce((a, c) => a + c.value, 0);
  const slices = rest > 0 ? [...top, { name: "Other", value: rest }] : top;
  const monthName = new Intl.DateTimeFormat(ws.locale, { month: "long", timeZone: "UTC" }).format(new Date(`${monthKey}-01T00:00:00Z`));
  const r = 44;
  const c = 2 * Math.PI * r;
  // Each slice starts where the previous ones end.
  const starts = slices.map((_, i) => slices.slice(0, i).reduce((a, x) => a + (x.value / total) * c, 0));

  return (
    <section aria-label="Spending this month" className="rounded-[28px] bg-card p-6 shadow-clay">
      {total > 0 && block ? (
        <button type="button" onClick={() => go({ tab: "report", report: null })} className="flex w-full items-center gap-6 text-left">
          <div className="relative size-[104px] shrink-0">
            <svg viewBox="0 0 104 104" className="size-full -rotate-90" role="img" aria-label={`Spent ${formatMoney(block.expenses, ws.locale)} in ${monthName}`}>
              <circle cx="52" cy="52" r={r} fill="none" strokeWidth="12" className="stroke-tint-mist" />
              {slices.map((sl, i) => {
                const len = (sl.value / total) * c;
                return <circle key={sl.name} cx="52" cy="52" r={r} fill="none" strokeWidth="12" stroke={DONUT[i % DONUT.length]} strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-starts[i]!} />;
              })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden>
              <span className="font-display text-[17px] leading-tight">{new Intl.NumberFormat(ws.locale, { notation: "compact", maximumFractionDigits: 1 }).format(Number(block.expenses.amount))}</span>
              <span className="text-[11px] text-muted-foreground">{block.currency} · {monthName.slice(0, 3)}</span>
            </div>
          </div>
          <ul className="grid min-w-0 flex-1 gap-2">
            {slices.map((sl, i) => (
              <li key={sl.name} className="flex items-center gap-2.5">
                <span className="size-2 shrink-0 rounded-full" style={{ background: DONUT[i % DONUT.length] }} aria-hidden />
                <span className="min-w-0 flex-1 truncate font-display text-[16px]">{sl.name}</span>
                <span className="tabular text-[13px] text-muted-foreground">{Math.round((sl.value / total) * 100)}%</span>
              </li>
            ))}
          </ul>
        </button>
      ) : (
        <div className="flex h-full min-h-[104px] flex-col justify-center">
          <p className="font-display text-[20px]">No spending yet in {monthName}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">Expenses you record show up here by category.</p>
        </div>
      )}
    </section>
  );
}

const ICONS: [RegExp, LucideIcon][] = [
  [/grocer|food|market/i, ShoppingCart],
  [/dining|coffee|cafe|restaurant|eat/i, Coffee],
  [/transport|fuel|taxi|car/i, Car],
  [/rent|housing|home/i, Home],
  [/utilit|internet|electric|power/i, Zap],
  [/health|medical|pharm/i, HeartPulse],
  [/family|giving|gift/i, Users],
  [/educat|course|school|book/i, GraduationCap],
  [/subscri/i, Repeat],
  [/personal|cloth/i, Shirt],
  [/work|business|client/i, Briefcase],
];

function txIcon(t: Transaction, category: string | undefined): { icon: LucideIcon; tint: string } {
  if (t.kind === "transfer") return { icon: ArrowLeftRight, tint: "bg-tint-mist" };
  if (t.kind === "income") return { icon: TrendingUp, tint: "bg-tint-sage" };
  const hit = category ? ICONS.find(([re]) => re.test(category)) : undefined;
  return { icon: hit?.[1] ?? Receipt, tint: t.kind === "expense" ? "bg-tint-clay" : "bg-tint-sand" };
}

/** The latest entries: tinted icon, Fraunces name, "Today · Food" and the amount (income in sage). */
function Recent() {
  const ws = useFinance();
  const { go } = useNav();
  const cats = new Map(ws.categories.map((c) => [c.id, c.name]));
  const accounts = new Map(ws.accounts.map((a) => [a.id, a.name]));
  const list = [...ws.recent]
    .filter((t) => t.kind !== "transfer" || !t.amount.startsWith("-"))
    .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))
    .slice(0, 6);
  return (
    <ClaySection title="Recent" action={<Button size="sm" variant="ghost" onClick={() => go({ tab: "transactions" })}>All</Button>}>
      {list.length ? (
        <ul className="grid">
          {list.map((t) => {
            const cat = t.category_id ? cats.get(t.category_id) : undefined;
            const { icon: Icon, tint } = txIcon(t, cat);
            const day = relativeDay(t.occurred_on, ws.today);
            const when = day === "today" || day === "yesterday" ? day[0]!.toUpperCase() + day.slice(1) : formatShortDate(t.occurred_on, ws.locale);
            return (
              <li key={t.id} className="flex items-center gap-3.5 border-b border-border py-3 last:border-b-0">
                <span className={cn("flex size-[42px] shrink-0 items-center justify-center rounded-[14px]", tint)}>
                  <Icon className="size-[18px]" strokeWidth={1.6} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-[16px]">{t.description || t.payee || cat || "Transaction"}</span>
                  <span className="block truncate text-[12px] text-muted-foreground">
                    {when}{cat ? ` · ${cat}` : t.kind === "transfer" ? " · Transfer" : ""}
                    <span className="max-lg:hidden"> · {accounts.get(t.account_id)}</span>
                  </span>
                </span>
                <Amount m={money(t.amount, t.currency)} signed tone className="text-[14px] font-medium" />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-2 font-display text-[16px] text-muted-foreground italic">Nothing recorded yet.</p>
      )}
    </ClaySection>
  );
}
