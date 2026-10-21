"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { totalsByCurrency } from "@/lib/money";
import { importTransactions } from "@/server/actions/finance";
import { buildImport, parseCsv, type DateFormat, type ImportMapping } from "./csv";
import { Amount, money, useFinance } from "./shared";

const MAX_BYTES = 5 * 1024 * 1024;
const CHUNK = 200;

function guess(header: string[]): Partial<ImportMapping> & { split: boolean } {
  const find = (re: RegExp) => { const i = header.findIndex((h) => re.test(h)); return i < 0 ? undefined : i; };
  const amount = find(/amount|value|sum/i);
  const debit = find(/debit|withdraw|money out|paid out/i);
  const credit = find(/credit|deposit|money in|paid in/i);
  return {
    date: find(/date|posted/i) ?? 0,
    description: find(/desc|detail|narrat|memo|particular|reference|text/i) ?? 1,
    payee: find(/payee|merchant|counterpart|beneficiary/i),
    amount, debit, credit,
    split: amount === undefined && debit !== undefined && credit !== undefined,
  };
}

/** Pick a file, map its columns, check the preview, then import. Nothing is saved until the last step. */
export function ImportPanel({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const ws = useFinance();
  const open = ws.accounts.filter((a) => !a.archived_at);
  const [accountId, setAccountId] = useState(open[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [table, setTable] = useState<string[][] | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [map, setMap] = useState<ImportMapping & { split: boolean }>({ date: 0, description: 1, amount: 2, hasHeader: true, dateFormat: "YYYY-MM-DD", decimal: ".", split: false });
  const [pending, start] = useTransition();
  const [progress, setProgress] = useState<string | null>(null);
  const acct = ws.accounts.find((a) => a.id === accountId);

  const onFile = async (f: File | undefined) => {
    setFileError(null);
    setTable(null);
    if (!f) return;
    if (f.size > MAX_BYTES) return setFileError("That file is over 5 MB. Export a shorter date range.");
    const rows = parseCsv(await f.text());
    if (rows.length < 1 || Math.max(...rows.slice(0, 20).map((r) => r.length)) < 2) return setFileError("That doesn't look like a CSV statement with columns.");
    setFileName(f.name);
    setTable(rows);
    const g = guess(rows[0]);
    const iso = rows.slice(1, 6).some((r) => /^\d{4}-\d{1,2}-\d{1,2}/.test((r[g.date ?? 0] ?? "").trim()));
    setMap((m) => ({ ...m, ...g, dateFormat: iso ? "YYYY-MM-DD" : "DD/MM/YYYY", amount: g.split ? undefined : g.amount ?? 2 }));
  };

  const width = table ? Math.max(...table.slice(0, 20).map((r) => r.length)) : 0;
  const header = table && map.hasHeader ? table[0] : null;
  const colName = (i: number) => (header?.[i]?.trim() ? `${header[i].trim()} (column ${i + 1})` : `Column ${i + 1}`);
  const cols = Array.from({ length: width }, (_, i) => i);

  const result = useMemo(() => {
    if (!table || !acct) return null;
    const m: ImportMapping = { ...map, amount: map.split ? undefined : map.amount, debit: map.split ? map.debit : undefined, credit: map.split ? map.credit : undefined };
    return buildImport(table, m, acct.currency, ws.today);
  }, [table, map, acct, ws.today]);

  const inTotal = result ? totalsByCurrency(result.rows.filter((r) => !r.amount.startsWith("-")).map((r) => money(r.amount, acct!.currency))) : [];
  const outTotal = result ? totalsByCurrency(result.rows.filter((r) => r.amount.startsWith("-")).map((r) => money(r.amount.slice(1), acct!.currency))) : [];

  const doImport = () => {
    if (!result || !result.rows.length || !acct) return;
    start(async () => {
      let added = 0;
      let skipped = 0;
      try {
        for (let i = 0; i < result.rows.length; i += CHUNK) {
          setProgress(`Importing ${Math.min(i + CHUNK, result.rows.length)} of ${result.rows.length}…`);
          const chunk = result.rows.slice(i, i + CHUNK).map(({ occurred_on, amount, description, payee, external_id }) => ({ occurred_on, amount, description, payee, external_id }));
          const r = await importTransactions({ accountId: acct.id, categoryId, rows: chunk });
          if (!r.ok) {
            if (r.demo) toast(r.error, { description: "Try it after connecting a database." });
            else toast.error(added ? `${r.error} ${added} were imported before this.` : r.error);
            return;
          }
          added += r.data?.added ?? 0;
          skipped += r.data?.skipped ?? 0;
        }
        toast.success(`Imported ${added} transaction${added === 1 ? "" : "s"}${skipped ? `; skipped ${skipped} already imported` : ""}.`);
        onDone();
      } catch {
        toast.error(added ? `Stopped after ${added} rows. Import the same file again to add the rest; nothing will be duplicated.` : "Something went wrong. Please try again.");
      } finally {
        setProgress(null);
      }
    });
  };

  const set = <K extends keyof typeof map>(k: K, v: (typeof map)[K]) => setMap((m) => ({ ...m, [k]: v }));
  const colSelect = (id: string, label: string, value: number | undefined, onChange: (v: number | undefined) => void, optional = false) => (
    <Field id={id} label={label} optional={optional}>
      <NativeSelect id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}>
        {optional && <option value="">None</option>}
        {cols.map((i) => <option key={i} value={i}>{colName(i)}</option>)}
      </NativeSelect>
    </Field>
  );

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="imp-account" label="Into account">
          <NativeSelect id="imp-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {open.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
          </NativeSelect>
        </Field>
        <Field id="imp-file" label="Statement file (.csv)" error={fileError ?? undefined} hint={fileName && table ? `${fileName}: ${table.length} lines` : "Download it from your bank's website. It stays on this device until you import."}>
          <Input id="imp-file" type="file" accept=".csv,text/csv" className="h-auto py-1.5 text-[13px]" onChange={(e) => onFile(e.target.files?.[0])} />
        </Field>
      </div>

      {table && (
        <>
          <div className="grid gap-4 rounded-md border border-border p-3 sm:grid-cols-3">
            <label className="flex items-center gap-2 text-[13px] sm:col-span-3">
              <input type="checkbox" checked={map.hasHeader} onChange={(e) => set("hasHeader", e.target.checked)} className="size-4 accent-[var(--color-brand)]" /> First line is column names
            </label>
            {colSelect("imp-date", "Date", map.date, (v) => set("date", v ?? 0))}
            <Field id="imp-datefmt" label="Date format">
              <NativeSelect id="imp-datefmt" value={map.dateFormat} onChange={(e) => set("dateFormat", e.target.value as DateFormat)}>
                <option value="YYYY-MM-DD">2026-10-31</option>
                <option value="DD/MM/YYYY">31/10/2026 (day first)</option>
                <option value="MM/DD/YYYY">10/31/2026 (month first)</option>
              </NativeSelect>
            </Field>
            {colSelect("imp-desc", "Description", map.description, (v) => set("description", v ?? 0))}
            <Field id="imp-mode" label="Amounts are in">
              <NativeSelect id="imp-mode" value={map.split ? "split" : "one"} onChange={(e) => set("split", e.target.value === "split")}>
                <option value="one">One column (+/−)</option>
                <option value="split">Separate in and out columns</option>
              </NativeSelect>
            </Field>
            {map.split ? (
              <>
                {colSelect("imp-debit", "Money out", map.debit, (v) => set("debit", v))}
                {colSelect("imp-credit", "Money in", map.credit, (v) => set("credit", v))}
              </>
            ) : colSelect("imp-amount", "Amount", map.amount, (v) => set("amount", v))}
            <Field id="imp-decimal" label="Decimal mark">
              <NativeSelect id="imp-decimal" value={map.decimal} onChange={(e) => set("decimal", e.target.value as "." | ",")}>
                <option value=".">1,234.56</option>
                <option value=",">1.234,56</option>
              </NativeSelect>
            </Field>
            {colSelect("imp-payee", "Payee", map.payee, (v) => set("payee", v), true)}
            <Field id="imp-category" label="Category for all" optional hint="Applied where it fits (spending or income).">
              <NativeSelect id="imp-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Leave uncategorised</option>
                {ws.categories.filter((c) => !c.archived_at).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.kind === "income" ? "income" : "spending"})</option>)}
              </NativeSelect>
            </Field>
            {!map.split && (
              <label className="flex items-center gap-2 text-[13px] sm:col-span-3">
                <input type="checkbox" checked={!!map.invert} onChange={(e) => set("invert", e.target.checked)} className="size-4 accent-[var(--color-brand)]" /> Spending shows as positive numbers in this file (flip the signs)
              </label>
            )}
          </div>

          {result && (
            <div className="grid gap-2">
              <p className="text-[13px]">
                <span className="font-medium">{result.rows.length} ready to import</span>
                {result.errors.length > 0 && <span className="text-destructive"> · {result.errors.length} can&apos;t be read</span>}
                {result.rows.length > 0 && (
                  <span className="text-muted-foreground"> · in {inTotal.length ? inTotal.map((m) => <Amount key={m.currency} m={m} />) : "nothing"}, out {outTotal.length ? outTotal.map((m) => <Amount key={m.currency} m={m} />) : "nothing"}</span>
                )}
              </p>
              {result.errors.length > 0 && (
                <ul className="max-h-24 overflow-y-auto rounded-md bg-destructive/5 p-2 text-[12px] text-destructive">
                  {result.errors.slice(0, 20).map((e) => <li key={e.line}>{e.line ? `Line ${e.line}: ` : ""}{e.message}</li>)}
                  {result.errors.length > 20 && <li>…and {result.errors.length - 20} more</li>}
                </ul>
              )}
              {result.rows.length > 0 && (
                <div className="max-h-56 overflow-auto rounded-md border border-border">
                  <table className="w-full text-[12px]">
                    <thead className="sticky top-0 bg-muted text-left text-muted-foreground">
                      <tr><th className="px-2 py-1 font-medium">Date</th><th className="px-2 py-1 font-medium">Description</th><th className="px-2 py-1 text-right font-medium">Amount</th></tr>
                    </thead>
                    <tbody>
                      {result.rows.slice(0, 50).map((r) => (
                        <tr key={r.line} className="border-t border-border">
                          <td className="px-2 py-1 whitespace-nowrap">{r.occurred_on}</td>
                          <td className="max-w-64 truncate px-2 py-1">{r.description || r.payee || "—"}</td>
                          <td className="px-2 py-1 text-right"><Amount m={money(r.amount, acct!.currency)} signed tone={!r.amount.startsWith("-")} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">Check that spending shows as minus. Rows you&apos;ve imported before into this account are skipped, so importing the same file twice is safe. Rows with errors are left out.</p>
            </div>
          )}
        </>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        {progress && <span className="text-[12px] text-muted-foreground sm:mr-auto" aria-live="polite">{progress}</span>}
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>Cancel</Button>
        <Button type="button" onClick={doImport} disabled={pending || !result?.rows.length}>{pending ? "Importing…" : `Import ${result?.rows.length ?? 0} rows`}</Button>
      </div>
    </div>
  );
}
