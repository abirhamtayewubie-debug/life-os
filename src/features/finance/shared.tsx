"use client";

import { createContext, useContext } from "react";
import { formatMoney, type Money } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { FinanceWorkspace } from "./types";

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
