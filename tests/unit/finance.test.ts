import { describe, expect, it } from "vitest";
import { buildImport, parseAmount, parseCsv, parseDate, toCsv } from "@/features/finance/csv";
import {
  budgetStatus, convertMoney, findRate, loanSummary, monthlyEquivalent, monthlyReport, netWorth, nextDue, payoffMonths, periodBounds, savingsProgress, shiftMonth, spendIn,
  type Category, type LedgerTx, type Rate,
} from "@/features/finance/ledger";

const rates: Rate[] = [
  { base: "USD", quote: "ETB", rate: "120.5", as_of: "2026-10-01" },
  { base: "USD", quote: "ETB", rate: "125", as_of: "2026-10-15" },
  { base: "CAD", quote: "USD", rate: "0.72", as_of: "2026-09-01" },
];

describe("conversion", () => {
  it("uses the newest rate on or before the date, and never invents one", () => {
    expect(convertMoney({ amount: "10.00", currency: "USD" }, "ETB", rates, "2026-10-10")).toEqual({ money: { amount: "1205.00", currency: "ETB" }, asOf: "2026-10-01" });
    expect(convertMoney({ amount: "10.00", currency: "USD" }, "ETB", rates, "2026-10-20")?.money.amount).toBe("1250.00");
    expect(convertMoney({ amount: "10.00", currency: "USD" }, "ETB", rates, "2026-09-30")).toBeNull();
    expect(convertMoney({ amount: "10.00", currency: "CAD" }, "ETB", rates, "2026-10-20")).toBeNull(); // no chaining through USD
  });
  it("inverts a rate entered the other way round, rounding half away from zero", () => {
    expect(convertMoney({ amount: "1000.00", currency: "ETB" }, "USD", rates, "2026-10-20")?.money.amount).toBe("8.00");
    expect(convertMoney({ amount: "-1.00", currency: "ETB" }, "USD", rates, "2026-10-20")?.money.amount).toBe("-0.01");
    expect(findRate(rates, "USD", "USD", "2026-10-20")).toBeNull();
  });
});

describe("net worth", () => {
  const accounts = [
    { id: "a", name: "Bank", currency: "ETB", balance: "50000.00", is_liability: false, include_in_net_worth: true },
    { id: "b", name: "Payoneer", currency: "USD", balance: "100.00", is_liability: false, include_in_net_worth: true },
    { id: "c", name: "Loan", currency: "ETB", balance: "-20000.00", is_liability: true, include_in_net_worth: true },
    { id: "d", name: "CAD card", currency: "CAD", balance: "-50.00", is_liability: true, include_in_net_worth: true },
    { id: "e", name: "Hidden", currency: "ETB", balance: "999.00", is_liability: false, include_in_net_worth: false },
  ];
  it("totals what it can convert and lists what it can't", () => {
    const n = netWorth(accounts, "ETB", rates, "2026-10-20");
    expect(n.total).toEqual({ amount: "42500.00", currency: "ETB" });
    expect(n.assets.amount).toBe("62500.00");
    expect(n.liabilities.amount).toBe("20000.00");
    expect(n.missing).toEqual([{ currency: "CAD", amount: { amount: "-50.00", currency: "CAD" } }]);
    expect(n.oldestRate).toBe("2026-10-15");
  });
  it("has no total when nothing converts", () => {
    expect(netWorth([accounts[3]], "ETB", [], "2026-10-20").total).toBeNull();
  });
});

const cats: Category[] = [
  { id: "food", name: "Food", kind: "expense", parent_id: null },
  { id: "dining", name: "Dining out", kind: "expense", parent_id: "food" },
  { id: "rent", name: "Rent", kind: "expense", parent_id: null },
  { id: "pay", name: "Client income", kind: "income", parent_id: null },
];
const tx = (id: string, category_id: string | null, kind: LedgerTx["kind"], amount: string, occurred_on: string, currency = "ETB", is_pending = false): LedgerTx =>
  ({ id, account_id: "a", category_id, kind, amount, currency, occurred_on, is_pending });

describe("budgets", () => {
  it("counts sub-categories toward the parent line, converts with rates and flags what it can't", () => {
    const txs = [
      tx("1", "food", "expense", "-1000.00", "2026-10-02"),
      tx("2", "dining", "expense", "-500.00", "2026-10-05"),
      tx("3", "food", "expense", "-10.00", "2026-10-16", "USD"), // 1250 ETB
      tx("4", "food", "expense", "-5.00", "2026-10-16", "CAD"), // no rate
      tx("5", "food", "expense", "-700.00", "2026-09-30"), // last month
      tx("6", "food", "expense", "-300.00", "2026-10-10", "ETB", true), // pending
      tx("7", "rent", "expense", "-9000.00", "2026-10-01"),
    ];
    const s = budgetStatus({ period: "monthly", currency: "ETB" }, [{ category_id: "food", amount: "3000.00" }, { category_id: "rent", amount: "9000.00" }], txs, cats, rates, "2026-10-20");
    const food = s.lines.find((l) => l.categoryId === "food")!;
    expect(food.spent.amount).toBe("2750.00");
    expect(food.remaining.amount).toBe("250.00");
    expect(food.status).toBe("watch"); // 91.7% spent at 65% of the month
    expect(s.lines.find((l) => l.categoryId === "rent")!.status).toBe("over");
    expect(s.unconverted).toEqual([{ currency: "CAD", amount: { amount: "5.00", currency: "CAD" }, count: 1 }]);
    expect(s.convertedCount).toBe(1);
    expect(s.pacePct).toBe(65);
  });
  it("finds weekly and monthly periods", () => {
    expect(periodBounds("weekly", "2026-10-21", 1)).toEqual({ start: "2026-10-19", end: "2026-10-25" });
    expect(periodBounds("weekly", "2026-10-21", 0)).toEqual({ start: "2026-10-18", end: "2026-10-24" });
    expect(periodBounds("monthly", "2028-02-10")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});

describe("monthly report", () => {
  it("reports each currency separately, leaves transfers out and compares with last month", () => {
    const r = monthlyReport([
      tx("1", "pay", "income", "30000.00", "2026-10-03"),
      tx("2", "dining", "expense", "-600.00", "2026-10-04"),
      tx("3", "food", "expense", "-400.00", "2026-10-05"),
      tx("4", "food", "expense", "-800.00", "2026-09-05"),
      tx("5", null, "transfer", "-5000.00", "2026-10-06"),
      tx("6", null, "expense", "-20.00", "2026-10-07", "USD"),
    ], cats, "2026-10");
    const etb = r.find((b) => b.currency === "ETB")!;
    expect(etb.income.amount).toBe("30000.00");
    expect(etb.expenses.amount).toBe("1000.00");
    expect(etb.net.amount).toBe("29000.00");
    expect(etb.savingsRate).toBe(96.6);
    expect(etb.byCategory.find((c) => c.name === "Food")).toMatchObject({ amount: { amount: "1000.00" }, previous: { amount: "800.00" }, change: { amount: "200.00" } });
    const usd = r.find((b) => b.currency === "USD")!;
    expect(usd.savingsRate).toBeNull();
    expect(usd.byCategory[0].name).toBe("Uncategorised");
  });
});

describe("bills, savings and debt", () => {
  it("moves due dates and averages schedules per month", () => {
    expect(nextDue("2026-01-31", 1, "month")).toBe("2026-02-28");
    expect(nextDue("2026-10-21", 2, "week")).toBe("2026-11-04");
    expect(nextDue("2028-02-29", 1, "year")).toBe("2029-02-28");
    expect(monthlyEquivalent({ amount: "-12.00", currency: "USD" }, 1, "week").amount).toBe("-52.00");
    expect(monthlyEquivalent({ amount: "-120.00", currency: "USD" }, 1, "year").amount).toBe("-10.00");
  });
  it("works out savings progress and what's needed per month", () => {
    const p = savingsProgress({ amount: "2500.00", currency: "ETB" }, { amount: "10000.00", currency: "ETB" }, "2026-10-21", "2027-04-21");
    expect(p.pct).toBe(25);
    expect(p.remaining.amount).toBe("7500.00");
    expect(p.monthsLeft).toBe(6);
    expect(p.perMonth?.amount).toBe("1250.00");
  });
  it("estimates payoff and refuses when the payment doesn't cover interest", () => {
    expect(payoffMonths({ amount: "1200.00", currency: "USD" }, 0, { amount: "100.00", currency: "USD" })).toEqual({ months: 12, totalInterest: { amount: "0.00", currency: "USD" } });
    const r = payoffMonths({ amount: "1000.00", currency: "USD" }, 12, { amount: "100.00", currency: "USD" })!;
    expect(r.months).toBe(11);
    expect(Number(r.totalInterest.amount)).toBeGreaterThan(50);
    expect(payoffMonths({ amount: "10000.00", currency: "USD" }, 24, { amount: "100.00", currency: "USD" })).toBeNull();
  });
});

describe("csv", () => {
  it("parses quotes, separators and blank lines", () => {
    expect(parseCsv('Date,Desc,Amount\r\n2026-10-01,"Coffee, beans",-12.50\n\n2026-10-02,"He said ""hi""",3\n')).toEqual([
      ["Date", "Desc", "Amount"], ["2026-10-01", "Coffee, beans", "-12.50"], ["2026-10-02", 'He said "hi"', "3"],
    ]);
    expect(parseCsv("a;b\n1,5;2")).toEqual([["a", "b"], ["1,5", "2"]]);
  });
  it("reads statement amounts and dates strictly", () => {
    expect(parseAmount("1,234.50")).toBe("1234.50");
    expect(parseAmount("(12.00)")).toBe("-12.00");
    expect(parseAmount("ETB 2,000")).toBe("2000");
    expect(parseAmount("45.10-")).toBe("-45.10");
    expect(parseAmount("1.234,50", ",")).toBe("1234.50");
    expect(parseAmount("abc")).toBeNull();
    expect(parseDate("31/01/2026", "DD/MM/YYYY")).toBe("2026-01-31");
    expect(parseDate("01/31/2026", "MM/DD/YYYY")).toBe("2026-01-31");
    expect(parseDate("2026-02-30", "YYYY-MM-DD")).toBeNull();
  });
  it("builds rows with stable ids for duplicates and reports bad lines", () => {
    const table = parseCsv("Date,Text,Out,In\n2026-10-01,Taxi,120,\n2026-10-01,Taxi,120,\n2026-10-02,Salary,,5000\nbad,x,1,\n2026-10-03,Odd,1.234,");
    const r = buildImport(table, { date: 0, description: 1, debit: 2, credit: 3, hasHeader: true, dateFormat: "YYYY-MM-DD", decimal: "." }, "ETB", "2026-10-21");
    expect(r.rows.map((x) => [x.amount, x.external_id])).toEqual([
      ["-120", "csv:2026-10-01|-120|taxi|1"], ["-120", "csv:2026-10-01|-120|taxi|2"], ["5000", "csv:2026-10-02|5000|salary|1"],
    ]);
    expect(r.errors).toEqual([{ line: 5, message: 'Can\'t read the date "bad"' }, { line: 6, message: "More than 2 decimal places for ETB" }]);
  });
  it("neutralises spreadsheet formulas on export but keeps negative numbers", () => {
    expect(toCsv([["=HYPERLINK(1)", "-12.50", "a,b"]])).toBe("'=HYPERLINK(1),-12.50,\"a,b\"\r\n");
  });
});

describe("project spending", () => {
  it("converts each expense with the rate for its date and lists what it can't convert", () => {
    const r = spendIn("ETB", [
      { amount: "-1000.00", currency: "ETB", occurred_on: "2026-10-02" },
      { amount: "-10.00", currency: "USD", occurred_on: "2026-10-02" },
      { amount: "-10.00", currency: "USD", occurred_on: "2026-10-16" },
      { amount: "-5.00", currency: "EUR", occurred_on: "2026-10-16" },
    ], rates);
    expect(r.spent).toEqual({ amount: "3455.00", currency: "ETB" });
    expect(r.unconverted).toEqual([{ amount: "5.00", currency: "EUR" }]);
    expect(r.oldestRate).toBe("2026-10-01");
    expect(r.count).toBe(4);
  });
});

describe("loanSummary", () => {
  const today = "2026-10-24";
  it("borrowed through a transfer, part repaid, with more borrowed later", () => {
    const s = loanSummary({ direction: "borrowed", currency: "ETB", due_on: "2026-10-28" }, { opening_balance: "0", balance: "-4000.00" },
      [{ amount: "-5000.00" }, { amount: "2000.00" }, { amount: "-1000.00" }], today);
    expect(s.total).toEqual({ amount: "6000.00", currency: "ETB" });
    expect(s.repaid).toEqual({ amount: "2000.00", currency: "ETB" });
    expect(s.outstanding).toEqual({ amount: "4000.00", currency: "ETB" });
    expect(Math.round(s.pct)).toBe(33);
    expect(s.settled).toBe(false);
    expect(s.due).toEqual({ state: "soon", inDays: 4 });
  });
  it("lent with an opening balance, paid back in full: settled and no due state", () => {
    const s = loanSummary({ direction: "lent", currency: "ETB", due_on: "2026-10-01" }, { opening_balance: "3000", balance: "0" }, [{ amount: "-3000" }], today);
    expect(s.total.amount).toBe("3000.00");
    expect(s.settled).toBe(true);
    expect(s.pct).toBe(100);
    expect(s.due).toBeNull();
    expect(s.overpaid).toBeNull();
  });
  it("flags overpayment and an overdue date", () => {
    const s = loanSummary({ direction: "lent", currency: "USD", due_on: "2026-10-20" }, { opening_balance: "100", balance: "-10" }, [{ amount: "-110" }], today);
    expect(s.outstanding.amount).toBe("0.00");
    expect(s.overpaid).toEqual({ amount: "10.00", currency: "USD" });
    const late = loanSummary({ direction: "borrowed", currency: "USD", due_on: "2026-10-20" }, { opening_balance: "-100", balance: "-100" }, [], today);
    expect(late.due?.state).toBe("overdue");
  });
});
