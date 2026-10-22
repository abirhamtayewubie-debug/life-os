import { audit, liveContext } from "@/server/actions/guard";
import { buildExport, readTable } from "@/server/export";
import { EXPORT_TABLES, isExportTable, rowsToCsv, zipStore } from "@/features/export/tables";

/**
 * Downloads of your own data, read through your session (RLS applies):
 *   ?format=json          everything in one JSON file
 *   ?format=zip           every table as a CSV file, in one .zip
 *   ?format=csv&table=x   one table as CSV
 */
export async function GET(req: Request) {
  const ctx = await liveContext();
  if (!ctx) return new Response("Export needs a connected database. Demo mode has nothing of yours to export.", { status: 400 });
  const sp = new URL(req.url).searchParams;
  const format = sp.get("format") ?? "json";
  const day = new Date().toISOString().slice(0, 10);
  const headers = (type: string, name: string) => ({
    "Content-Type": type,
    "Content-Disposition": `attachment; filename="${name}"`,
    "Cache-Control": "private, no-store",
  });

  try {
    if (format === "json") {
      const data = await buildExport(ctx.supabase, ctx.viewer.userId, ctx.viewer.email);
      await audit(ctx, "export.json", undefined, { tables: EXPORT_TABLES.length });
      return new Response(JSON.stringify(data, null, 2), { headers: headers("application/json; charset=utf-8", `life-os-export-${day}.json`) });
    }
    if (format === "zip") {
      const data = await buildExport(ctx.supabase, ctx.viewer.userId, ctx.viewer.email);
      const enc = new TextEncoder();
      const files = EXPORT_TABLES.map((t) => ({ name: `${t}.csv`, data: enc.encode("﻿" + rowsToCsv(data.tables[t])) }));
      files.unshift({ name: "README.txt", data: enc.encode(readme(data.exportedAt)) });
      await audit(ctx, "export.csv_zip", undefined, { tables: EXPORT_TABLES.length });
      return new Response(zipStore(files).buffer as ArrayBuffer, { headers: headers("application/zip", `life-os-export-${day}.zip`) });
    }
    if (format === "csv") {
      const table = sp.get("table") ?? "";
      if (!isExportTable(table)) return new Response("Unknown table.", { status: 400 });
      const rows = await readTable(ctx.supabase, ctx.viewer.userId, table);
      await audit(ctx, "export.csv", { type: table });
      return new Response("﻿" + rowsToCsv(rows), { headers: headers("text/csv; charset=utf-8", `${table}-${day}.csv`) });
    }
    return new Response("Unknown format.", { status: 400 });
  } catch (e) {
    console.error("export failed", e);
    return new Response("The export couldn't be completed. Nothing was changed; please try again.", { status: 500 });
  }
}

function readme(at: string) {
  return [
    "Life OS export",
    `Exported at ${at} (UTC).`,
    "",
    "One CSV file per table, UTF-8 with a byte-order mark so spreadsheet apps read it correctly.",
    "Columns holding lists or structured values are written as JSON.",
    "Amounts are exact decimals in each row's own currency; nothing has been converted or added across currencies.",
    "The 'source' column says where each row came from: manual, imported, device, estimated, ai_suggested or sample.",
    "Connection secrets for integrations are never exported.",
    "",
  ].join("\r\n");
}
