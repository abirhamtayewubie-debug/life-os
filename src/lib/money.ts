/**
 * Decimal-safe money. Amounts travel as strings (Postgres numeric) and are
 * computed as integer minor units (bigint), never as binary floats.
 * Different currencies are never combined without an explicit rate.
 */

export type CurrencyCode = string; // ISO 4217, e.g. "ETB"

export type Money = { amount: string; currency: CurrencyCode };

const MINOR_UNITS: Record<string, number> = { ETB: 2, USD: 2, CAD: 2, EUR: 2, GBP: 2, KES: 2, AED: 2, JPY: 0 };

export function minorUnits(currency: CurrencyCode): number {
  return MINOR_UNITS[currency] ?? 2;
}

/** Parse a decimal string ("-1234.5") into integer minor units. Rounds half away from zero. */
export function toMinor(amount: string, currency: CurrencyCode): bigint {
  const s = amount.trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`Invalid amount: ${amount}`);
  const neg = s.startsWith("-");
  const [int, frac = ""] = s.replace("-", "").split(".");
  const digits = minorUnits(currency);
  const kept = (frac + "0".repeat(digits)).slice(0, digits);
  const roundDigit = Number(frac[digits] ?? "0");
  let v = BigInt(int + kept);
  if (roundDigit >= 5) v += 1n;
  return neg ? -v : v;
}

export function fromMinor(minor: bigint, currency: CurrencyCode): string {
  const digits = minorUnits(currency);
  const neg = minor < 0n;
  const abs = (neg ? -minor : minor).toString().padStart(digits + 1, "0");
  const int = abs.slice(0, abs.length - digits) || "0";
  const frac = digits ? "." + abs.slice(abs.length - digits) : "";
  return `${neg ? "-" : ""}${int}${frac}`;
}

export class CurrencyMismatchError extends Error {
  constructor(a: CurrencyCode, b: CurrencyCode) {
    super(`Cannot combine ${a} and ${b} without a conversion rate`);
  }
}

/** Sum amounts that must all share one currency. */
export function sumMoney(items: Money[], currency: CurrencyCode): Money {
  let total = 0n;
  for (const m of items) {
    if (m.currency !== currency) throw new CurrencyMismatchError(currency, m.currency);
    total += toMinor(m.amount, currency);
  }
  return { amount: fromMinor(total, currency), currency };
}

/** Group amounts by currency without converting. */
export function totalsByCurrency(items: Money[]): Money[] {
  const map = new Map<string, bigint>();
  for (const m of items) map.set(m.currency, (map.get(m.currency) ?? 0n) + toMinor(m.amount, m.currency));
  return [...map.entries()].map(([currency, v]) => ({ amount: fromMinor(v, currency), currency }));
}

/** Percentage (0–∞) of used vs limit in the same currency, to one decimal. */
export function percentOf(used: Money, limit: Money): number {
  if (used.currency !== limit.currency) throw new CurrencyMismatchError(used.currency, limit.currency);
  const l = toMinor(limit.amount, limit.currency);
  if (l === 0n) return 0;
  const u = toMinor(used.amount, used.currency);
  return Number((u * 1000n) / l) / 10;
}

export function formatMoney(m: Money, locale = "en-US", opts: { compact?: boolean; signed?: boolean } = {}): string {
  const value = Number(m.amount); // display only
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: m.currency,
    currencyDisplay: m.currency === "ETB" ? "code" : "narrowSymbol",
    notation: opts.compact ? "compact" : "standard",
    maximumFractionDigits: opts.compact ? 1 : minorUnits(m.currency),
    minimumFractionDigits: opts.compact ? 0 : minorUnits(m.currency),
    signDisplay: opts.signed ? "exceptZero" : "auto",
  }).format(value);
}
