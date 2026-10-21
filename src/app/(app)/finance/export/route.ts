import { toCsv } from "@/features/finance/csv";
import { getFinanceExport } from "@/server/finance";

/** The Transactions tab's current filter as a CSV file. Read-only; nothing leaves the server but your own rows. */
export async function GET(req: Request) {
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const { month, rows } = await getFinanceExport(sp);
  const csv = toCsv([
    ["Date", "Account", "Type", "Amount", "Currency", "Category", "Description", "Payee", "Notes", "Pending", "Source"],
    ...rows.map((r) => [r.date, r.account, r.kind, r.amount, r.currency, r.category, r.description, r.payee, r.notes, r.pending ? "yes" : "", r.source]),
  ]);
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="transactions-${month}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
