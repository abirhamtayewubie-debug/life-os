import { parseAmount, parseDate } from "./csv";

/**
 * Reads the confirmation texts CBE and telebirr send after each transaction.
 * The wording changes now and then, so this looks for the parts every
 * version has (an amount, a direction, usually a date, a reference and a
 * balance) instead of matching whole sentences.
 */

export type Bank = "cbe" | "telebirr";
export const BANK_NAMES: Record<Bank, string> = { cbe: "CBE", telebirr: "telebirr" };

export type SmsTransaction = {
  bank: Bank;
  /** Signed: negative for money out. Includes any fee and VAT the text lists. */
  amount: string;
  currency: string;
  /** Fee plus VAT included in `amount`, when the text lists them. */
  fees: string | null;
  occurred_on: string;
  /** True when the text has no date and today's was used. */
  dateGuessed: boolean;
  counterparty: string | null;
  reference: string | null;
  /** The balance the bank reports after this transaction. */
  balance: string | null;
  description: string;
  external_id: string;
};

export type SmsResult = { ok: true; tx: SmsTransaction; text: string } | { ok: false; error: string; text: string };

const AMOUNT = String.raw`(?:ETB|Birr|Br\.?)\s?(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s?(?:ETB|Birr|Br\b)`;
const amountAt = (s: string) => {
  const m = s.match(new RegExp(AMOUNT, "i"));
  return m ? parseAmount(m[1] ?? m[2]) : null;
};

const OUT = /\b(debited|transfer+ed|sent|paid|bought|purchased|withdrawn|withdrew|payment of)\b/i;
const IN = /\b(credited|received|deposited)\b/i;

export function detectBank(text: string): Bank | null {
  if (/tele\s?birr|ethio\s?telecom|ethiotelecom/i.test(text)) return "telebirr";
  if (/\bCBE\b|commercial bank of ethiopia|cbe\.com\.et|banking with cbe/i.test(text)) return "cbe";
  return null;
}

/** Splits a paste of several texts into one string per text. */
export function splitMessages(text: string): string[] {
  const clean = text.replace(/\r\n?/g, "\n").trim();
  if (!clean) return [];
  const byDear = clean.split(/(?=\bDear\s)/).map((s) => s.trim()).filter(Boolean);
  const parts = byDear.length > 1 ? byDear : clean.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  // A line before the first "Dear" (a sender name or a share title) belongs to that text.
  if (parts.length > 1 && !amountAt(parts[0])) return [`${parts[0]}\n${parts[1]}`, ...parts.slice(2)];
  return parts;
}

function readDate(text: string): string | null {
  const m = text.match(/\b(\d{1,2}[/.-]\d{1,2}[/.-]\d{4}|\d{4}-\d{1,2}-\d{1,2})\b/);
  if (!m) return null;
  return /^\d{4}/.test(m[1]) ? parseDate(m[1], "YYYY-MM-DD") : parseDate(m[1], "DD/MM/YYYY");
}

function readReference(text: string): string | null {
  const m = text.match(/transaction (?:number|id|no\.?) is\s*:?\s*([A-Z0-9]{6,})/i)
    ?? text.match(/\bRef(?:erence)?\.? ?(?:No\.?|Number)?\s*:?\s*(FT[A-Z0-9]{6,}|[A-Z0-9]{8,})/i)
    ?? text.match(/[?&]id=(FT[A-Z0-9]+)/i)
    ?? text.match(/receipt\/([A-Z0-9]{6,})/i)
    ?? text.match(/\b(FT[0-9]{5}[A-Z0-9]{5,})\b/);
  // CBE links carry the reference plus the last 8 account digits; the reference alone is enough.
  return m ? m[1].toUpperCase().replace(/^(FT[A-Z0-9]{10})\d{8}$/, "$1") : null;
}

function readCounterparty(text: string, out: boolean): string | null {
  const re = out ? /\b(?:to|at)\s+(.+?)(?=\s*\(|\s+on\s|\s+from\s|\s+with\s|,|\.\s|\s+account|\s+for\s|$)/i
    : /\bfrom\s+(.+?)(?=\s*\(|\s+on\s|\s+to\s|\s+with\s|,|\.\s|\s+account|$)/i;
  const from = text.slice(text.search(out ? OUT : IN));
  const sentence = from.slice(0, from.search(/\.(\s|$)/) + 1 || undefined);
  const m = sentence.match(re);
  if (!m) return null;
  const name = m[1].replace(/\s+/g, " ").replace(/[.,;:]+$/, "").trim();
  if (!name || /^(your|the)\b/i.test(name) || /\d{4}/.test(name) || name.length > 80) return null;
  return name;
}

function readBalance(text: string): string | null {
  const m = text.match(new RegExp(String.raw`balance\s+(?:is|of)?\s*:?\s*(?:${AMOUNT})`, "i"));
  return m ? parseAmount(m[1] ?? m[2]) : null;
}

const add = (a: string, b: string) => {
  const scale = (s: string) => BigInt(Math.round(Number(s) * 100));
  const c = scale(a) + scale(b);
  return `${c / 100n}.${String(c % 100n).padStart(2, "0")}`;
};

/** Reads one text. `today` is used when the text has no date. */
export function parseBankSms(text: string, today: string): SmsResult {
  const bank = detectBank(text);
  if (!bank) return { ok: false, error: "This doesn't look like a CBE or telebirr transaction text.", text };
  if (/\b(otp|verification code|one.time)\b/i.test(text)) return { ok: false, error: "This is a code, not a transaction.", text };
  const outAt = text.search(OUT);
  const inAt = text.search(IN);
  if (outAt < 0 && inAt < 0) return { ok: false, error: `Couldn't tell if money went in or out in this ${BANK_NAMES[bank]} text.`, text };
  const out = outAt >= 0 && (inAt < 0 || outAt < inAt);
  const base = amountAt(text.slice(out ? outAt : inAt));
  if (!base || !/[1-9]/.test(base)) return { ok: false, error: `Couldn't find the amount in this ${BANK_NAMES[bank]} text.`, text };

  let total = base;
  let fees: string | null = null;
  if (out) {
    const totalM = text.match(new RegExp(String.raw`total of\s*(?:${AMOUNT})`, "i"));
    const fee = text.match(new RegExp(String.raw`(?:service fee|s\.?\s?charge)\s+(?:is|of)?\s*(?:${AMOUNT})`, "i"));
    const vat = text.match(new RegExp(String.raw`VAT(?: on the service fee)?\s+(?:is|of)?\s*(?:${AMOUNT})`, "i"));
    const feeN = fee ? parseAmount(fee[1] ?? fee[2]) : null;
    const vatN = vat ? parseAmount(vat[1] ?? vat[2]) : null;
    if (totalM && parseAmount(totalM[1] ?? totalM[2])) {
      total = parseAmount(totalM[1] ?? totalM[2])!;
    } else if (feeN || vatN) {
      total = add(add(base, feeN ?? "0"), vatN ?? "0");
    }
    const diff = Number(total) - Number(base);
    if (diff > 0) fees = add(total, `-${base}`);
    else total = base;
  }

  const date = readDate(text);
  const occurred_on = date && date <= today ? date : today;
  const reference = readReference(text);
  const counterparty = readCounterparty(text, out);
  const amount = `${out ? "-" : ""}${total}`;
  const verb = /airtime|recharge/i.test(text) ? "Airtime" : out ? (counterparty ? `To ${counterparty}` : "Money out") : counterparty ? `From ${counterparty}` : "Money in";
  const description = `${BANK_NAMES[bank]}: ${verb}`.slice(0, 300);
  const fingerprint = reference ?? `${occurred_on}|${amount}|${(counterparty ?? "").toLowerCase()}|${readBalance(text) ?? ""}`;
  return {
    ok: true,
    text,
    tx: {
      bank, amount, currency: "ETB", fees, occurred_on, dateGuessed: !date || date > today,
      counterparty, reference, balance: readBalance(text), description,
      external_id: `sms:${bank}:${fingerprint}`.slice(0, 200),
    },
  };
}

export function parseBankMessages(text: string, today: string): SmsResult[] {
  return splitMessages(text).map((t) => parseBankSms(t, today));
}
