import { minorUnits } from "@/lib/money";

/**
 * Small, strict CSV helpers for bank statement import and export.
 * RFC 4180 quoting; commas or semicolons as separators.
 */

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === "") quoted = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

/** Cells a spreadsheet would treat as a formula get a leading apostrophe; plain numbers stay numbers. */
function safeCell(v: string): string {
  const s = /^[=+\-@\t\r]/.test(v) && !/^-?\d+(\.\d+)?$/.test(v) ? `'${v}` : v;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map((c) => safeCell(c === null || c === undefined ? "" : String(c))).join(",")).join("\r\n") + "\r\n";
}

/**
 * Parses a statement amount into a plain decimal string. Accepts thousands
 * separators, a currency code or symbol, a trailing minus, and (12.00) for
 * negatives. `decimal` says which mark separates decimals. Returns null if
 * the cell isn't clearly a number.
 */
export function parseAmount(raw: string, decimal: "." | "," = "."): string | null {
  let s = raw.trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/^[A-Za-z]{3}\s*|\s*[A-Za-z]{3}$/g, "").replace(/[$€£]|Br|CA\$/g, "").trim();
  if (s.endsWith("-")) { neg = !neg; s = s.slice(0, -1).trim(); }
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1).trim(); }
  if (s.startsWith("+")) s = s.slice(1).trim();
  const thousands = decimal === "." ? /[,\s'’]/g : /[.\s'’]/g;
  s = s.replace(thousands, "");
  if (decimal === ",") s = s.replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const [int, frac] = s.split(".");
  const out = `${int.replace(/^0+(?=\d)/, "")}${frac ? `.${frac}` : ""}`;
  return neg && /[1-9]/.test(out) ? `-${out}` : out;
}

export type DateFormat = "YYYY-MM-DD" | "DD/MM/YYYY" | "MM/DD/YYYY";

export function parseDate(raw: string, format: DateFormat): string | null {
  const s = raw.trim();
  let y: number, m: number, d: number;
  if (format === "YYYY-MM-DD") {
    const r = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (!r) return null;
    [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  } else {
    const r = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (!r) return null;
    [d, m] = format === "DD/MM/YYYY" ? [Number(r[1]), Number(r[2])] : [Number(r[2]), Number(r[1])];
    y = Number(r[3]);
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

export type ImportMapping = {
  date: number;
  description: number;
  /** One signed amount column, or separate money-out / money-in columns. */
  amount?: number;
  debit?: number;
  credit?: number;
  payee?: number;
  hasHeader: boolean;
  dateFormat: DateFormat;
  decimal: "." | ",";
  /** Flip signs for statements that show spending as positive numbers. */
  invert?: boolean;
};

export type ImportRow = { line: number; occurred_on: string; amount: string; description: string; payee: string | null; external_id: string };
export type ImportResult = { rows: ImportRow[]; errors: { line: number; message: string }[] };

const MAX_ROWS = 5000;

/** Turns parsed CSV rows into transactions to insert, or says exactly which lines are wrong. */
export function buildImport(table: string[][], map: ImportMapping, currency: string, today: string): ImportResult {
  const body = map.hasHeader ? table.slice(1) : table;
  const rows: ImportRow[] = [];
  const errors: { line: number; message: string }[] = [];
  const seen = new Map<string, number>();
  const digits = minorUnits(currency);
  if (body.length > MAX_ROWS) return { rows: [], errors: [{ line: 0, message: `That file has ${body.length} rows; import up to ${MAX_ROWS} at a time.` }] };

  body.forEach((cells, i) => {
    const line = i + (map.hasHeader ? 2 : 1);
    const get = (idx?: number) => (idx === undefined ? "" : (cells[idx] ?? "").trim());
    const date = parseDate(get(map.date), map.dateFormat);
    if (!date) return errors.push({ line, message: `Can't read the date "${get(map.date)}"` });
    if (date > today) return errors.push({ line, message: "Date is in the future" });

    let amount: string | null;
    if (map.amount !== undefined) amount = parseAmount(get(map.amount), map.decimal);
    else {
      const out = get(map.debit) ? parseAmount(get(map.debit), map.decimal) : null;
      const inn = get(map.credit) ? parseAmount(get(map.credit), map.decimal) : null;
      if (out && inn && Number(out) !== 0 && Number(inn) !== 0) return errors.push({ line, message: "Both money in and money out are filled" });
      amount = out && Number(out) !== 0 ? `-${out.replace(/^-/, "")}` : inn ? inn.replace(/^-/, "") : null;
    }
    if (amount === null) return errors.push({ line, message: "Can't read the amount" });
    if (map.invert) amount = amount.startsWith("-") ? amount.slice(1) : `-${amount}`;
    const frac = amount.split(".")[1] ?? "";
    if (frac.replace(/0+$/, "").length > digits) return errors.push({ line, message: `More than ${digits} decimal places for ${currency}` });
    if (!/[1-9]/.test(amount)) return errors.push({ line, message: "Amount is zero" });

    const description = get(map.description).slice(0, 300);
    const payee = map.payee !== undefined ? get(map.payee).slice(0, 200) || null : null;
    // The same date, amount and text twice in one file is two real
    // transactions; numbering them keeps re-imports from duplicating either.
    const key = `${date}|${amount}|${description.toLowerCase()}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    rows.push({ line, occurred_on: date, amount, description, payee, external_id: `csv:${key}|${n}`.slice(0, 200) });
  });
  return { rows, errors };
}
