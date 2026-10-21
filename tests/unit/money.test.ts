import { describe, expect, it } from "vitest";
import { CurrencyMismatchError, formatMoney, fromMinor, percentOf, sumMoney, toMinor, totalsByCurrency } from "@/lib/money";

describe("money", () => {
  it("parses decimal strings into minor units without float error", () => {
    expect(toMinor("0.1", "USD") + toMinor("0.2", "USD")).toBe(30n);
    expect(toMinor("749.5000", "ETB")).toBe(74950n);
    expect(toMinor("-250.5", "ETB")).toBe(-25050n);
    expect(toMinor("1.005", "USD")).toBe(101n); // half away from zero
    expect(toMinor("-1.005", "USD")).toBe(-101n);
    expect(toMinor("123456789012345.67", "CAD")).toBe(12345678901234567n);
  });

  it("rejects malformed amounts", () => {
    expect(() => toMinor("1e3", "USD")).toThrow();
    expect(() => toMinor("12,50", "USD")).toThrow();
    expect(() => toMinor("", "USD")).toThrow();
  });

  it("round-trips minor units", () => {
    expect(fromMinor(5n, "USD")).toBe("0.05");
    expect(fromMinor(-105n, "ETB")).toBe("-1.05");
    expect(fromMinor(0n, "CAD")).toBe("0.00");
  });

  it("refuses to add different currencies", () => {
    expect(() => sumMoney([{ amount: "1", currency: "USD" }, { amount: "1", currency: "ETB" }], "USD")).toThrow(CurrencyMismatchError);
    expect(() => percentOf({ amount: "1", currency: "USD" }, { amount: "10", currency: "CAD" })).toThrow(CurrencyMismatchError);
  });

  it("totals per currency instead of combining", () => {
    const t = totalsByCurrency([
      { amount: "10.10", currency: "ETB" },
      { amount: "5", currency: "USD" },
      { amount: "0.90", currency: "ETB" },
    ]);
    expect(t).toEqual([{ amount: "11.00", currency: "ETB" }, { amount: "5.00", currency: "USD" }]);
  });

  it("computes budget percentages", () => {
    expect(percentOf({ amount: "45", currency: "ETB" }, { amount: "90", currency: "ETB" })).toBe(50);
    expect(percentOf({ amount: "1", currency: "ETB" }, { amount: "3", currency: "ETB" })).toBe(33.3);
    expect(percentOf({ amount: "5", currency: "ETB" }, { amount: "0", currency: "ETB" })).toBe(0);
  });

  it("formats with explicit currency", () => {
    expect(formatMoney({ amount: "1234.5", currency: "USD" })).toBe("$1,234.50");
    expect(formatMoney({ amount: "1234.5", currency: "ETB" })).toMatch(/^ETB\s1,234\.50$/);
  });
});
