"use client";

import { createContext, useContext } from "react";
import { formatShortDate } from "@/lib/dates";
import { formatMoney, type Money } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { Account, Budget, Category, FinanceWorkspace, Recurring, SavingsGoal, StoredRate, Transaction } from "./types";

export const FinanceContext = createContext<FinanceWorkspace | null>(null);
export function useFinance(): FinanceWorkspace {
  const ws = useContext(FinanceContext);
  if (!ws) throw new Error("useFinance outside FinanceContext");
  return ws;
}

/** Money with tabular figures; `tone` colours income green and spending neutral (never alarm-red for ordinary spending). */
export function Amount({ m, signed = false, tone = false, className }: { m: Money; signed?: boolean; tone?: boolean; className?: string }) {
  const ws = useContext(FinanceContext);
  const neg = m.amount.startsWith("-");
  return (
    <span className={cn("tabular whitespace-nowrap", tone && !neg && Number(m.amount) !== 0 && "text-success", className)}>
      {formatMoney(m, ws?.locale ?? "en-US", { signed })}
    </span>
  );
}

export const money = (amount: string, currency: string): Money => ({ amount, currency });

export function RateNote({ asOf, className }: { asOf: string | null; className?: string }) {
  if (!asOf) return null;
  return <span className={cn("text-[11px] text-muted-foreground", className)}>Converted with your rate from {asOf}</span>;
}

export const TABS = [
  { v: "overview", label: "Overview" },
  { v: "transactions", label: "Transactions" },
  { v: "budgets", label: "Budgets" },
  { v: "bills", label: "Bills" },
  { v: "savings", label: "Savings & debt" },
  { v: "report", label: "Monthly report" },
  { v: "setup", label: "Accounts & setup" },
] as const;
export type FinanceTab = (typeof TABS)[number]["v"];

export type Editor =
  | { k: "account"; x: Account | null }
  | { k: "tx"; x: Transaction | null }
  | { k: "transfer" }
  | { k: "category"; x: Category | null }
  | { k: "budget"; x: Budget | null }
  | { k: "recurring"; x: Recurring | null }
  | { k: "pay"; x: Recurring }
  | { k: "rate"; x: StoredRate | null }
  | { k: "savings"; x: SavingsGoal | null }
  | { k: "import" };

type Nav = { open: (e: Editor) => void; go: (params: Record<string, string | null>) => void };
export const NavContext = createContext<Nav | null>(null);
export function useNav(): Nav {
  const n = useContext(NavContext);
  if (!n) throw new Error("useNav outside FinanceScreen");
  return n;
}


/** What a savings goal has: the linked account's balance (never below zero), or the amount typed in. */
export function savedFor(goal: SavingsGoal, accounts: Account[]): Money {
  const a = goal.account_id ? accounts.find((x) => x.id === goal.account_id) : undefined;
  if (a && a.currency === goal.currency) return { amount: a.balance.startsWith("-") ? "0" : a.balance, currency: a.currency };
  return { amount: goal.saved_amount, currency: goal.currency };
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <h2 className="text-[13px] font-medium tracking-tight">{children}</h2>
      {action && <div className="ml-auto flex items-center gap-1">{action}</div>}
    </div>
  );
}

/** "Oct 23", with the year added when it isn't this year. */
export function dateLabel(dateKey: string, today: string, locale: string) {
  return `${formatShortDate(dateKey, locale)}${dateKey.slice(0, 4) !== today.slice(0, 4) ? `, ${dateKey.slice(0, 4)}` : ""}`;
}
