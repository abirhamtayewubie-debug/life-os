import type { DataSource } from "@/features/dashboard/types";
import type { Rate } from "./ledger";

export type AccountKind = "cash" | "checking" | "savings" | "credit_card" | "loan" | "investment" | "mobile_money" | "other";
export type TxKind = "income" | "expense" | "transfer" | "adjustment";
export type Unit = "week" | "month" | "year";

export type Account = {
  id: string;
  name: string;
  kind: AccountKind;
  currency: string;
  institution: string | null;
  opening_balance: string;
  opening_date: string;
  is_liability: boolean;
  interest_rate: string | null;
  include_in_net_worth: boolean;
  source: DataSource;
  archived_at: string | null;
  /** Ledger balance: opening balance plus posted (not pending) transactions. */
  balance: string;
  last_transaction_on: string | null;
};

export type Category = { id: string; parent_id: string | null; kind: "income" | "expense"; name: string; archived_at: string | null; source: DataSource };

export type Transaction = {
  id: string;
  account_id: string;
  category_id: string | null;
  recurring_id: string | null;
  project_id: string | null;
  kind: TxKind;
  amount: string;
  currency: string;
  occurred_on: string;
  description: string | null;
  payee: string | null;
  notes: string | null;
  transfer_group_id: string | null;
  is_pending: boolean;
  source: DataSource;
};

export type Recurring = {
  id: string;
  account_id: string;
  category_id: string | null;
  currency: string;
  description: string;
  amount: string;
  every_n: number;
  unit: Unit;
  next_due_on: string;
  ends_on: string | null;
  is_bill: boolean;
  is_subscription: boolean;
  remind_days_before: number;
  autopay: boolean;
  source: DataSource;
};

export type Budget = { id: string; name: string; period: "weekly" | "monthly"; currency: string; starts_on: string; ends_on: string | null; source: DataSource; lines: { id: string; category_id: string; amount: string }[] };

export type SavingsGoal = { id: string; goal_id: string | null; account_id: string | null; name: string; target_amount: string; currency: string; saved_amount: string; target_date: string | null; source: DataSource };

export type StoredRate = Rate & { id: string; source: DataSource };

export type TxFilters = { month: string; account?: string; category?: string; q?: string };

export type FinanceWorkspace = {
  accounts: Account[];
  categories: Category[];
  /** The filtered list for the Transactions tab. */
  list: Transaction[];
  listTruncated: boolean;
  /** Everything from the start of last month (relative to the report month) to today, for budgets and the report. */
  recent: Transaction[];
  recurring: Recurring[];
  budgets: Budget[];
  rates: StoredRate[];
  savings: SavingsGoal[];
  projects: { id: string; name: string }[];
  goals: { id: string; title: string }[];
  currencies: string[];
  baseCurrency: string;
  weekStart: number;
  filters: TxFilters;
  reportMonth: string;
  today: string;
  locale: string;
  demo: boolean;
};

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  cash: "Cash", checking: "Bank (current)", savings: "Savings", credit_card: "Credit card", loan: "Loan", investment: "Investment", mobile_money: "Mobile money", other: "Other",
};
export const LIABILITY_KINDS: AccountKind[] = ["credit_card", "loan"];
export const UNIT_LABEL: Record<Unit, [string, string]> = { week: ["week", "weeks"], month: ["month", "months"], year: ["year", "years"] };

export const DEFAULT_CATEGORIES: { kind: "income" | "expense"; name: string }[] = [
  { kind: "income", name: "Salary & wages" }, { kind: "income", name: "Client income" }, { kind: "income", name: "Other income" },
  { kind: "expense", name: "Groceries" }, { kind: "expense", name: "Dining out" }, { kind: "expense", name: "Transport" },
  { kind: "expense", name: "Rent & housing" }, { kind: "expense", name: "Utilities & internet" }, { kind: "expense", name: "Health" },
  { kind: "expense", name: "Family & giving" }, { kind: "expense", name: "Education" }, { kind: "expense", name: "Subscriptions" },
  { kind: "expense", name: "Personal & clothing" }, { kind: "expense", name: "Work & business" },
];
