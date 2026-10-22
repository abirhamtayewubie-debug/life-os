import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { crc32, EXPORT_TABLES, isExportTable, rowsToCsv, zipStore } from "@/features/export/tables";

describe("export tables", () => {
  it("never includes secrets or derived data, and lists each table once", () => {
    expect(isExportTable("integration_credentials")).toBe(false);
    expect(isExportTable("account_balances")).toBe(false);
    expect(isExportTable("tasks")).toBe(true);
    expect(new Set(EXPORT_TABLES).size).toBe(EXPORT_TABLES.length);
  });
});

describe("rowsToCsv", () => {
  it("unions columns, writes JSON for structured values and neutralises formulas", () => {
    const csv = rowsToCsv([
      { id: "1", title: "=HYPERLINK(\"x\")", tags: ["a", "b"] },
      { id: "2", amount: "-12.50", notes: null },
    ]);
    expect(csv.split("\r\n")).toEqual([
      "id,title,tags,amount,notes",
      `1,"'=HYPERLINK(""x"")","[""a"",""b""]",,`,
      "2,,,-12.50,",
      "",
    ]);
  });
  it("still writes a file for an empty table", () => {
    expect(rowsToCsv([])).toBe("\r\n");
  });
});

describe("zipStore", () => {
  it("computes standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
  it("produces an archive that unzip accepts and round-trips", () => {
    const enc = new TextEncoder();
    const zip = zipStore([{ name: "tasks.csv", data: enc.encode("id,title\r\n1,Ünïcode\r\n") }, { name: "empty.csv", data: new Uint8Array() }], new Date("2026-10-22T10:00:00Z"));
    const dir = mkdtempSync(join(tmpdir(), "zip-"));
    writeFileSync(join(dir, "x.zip"), zip);
    const out = execFileSync("python3", ["-I", "-c", "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(z.read('tasks.csv').decode()); print(z.namelist())", join(dir, "x.zip")]).toString();
    expect(out).toContain("1,Ünïcode");
    expect(out).toContain("['tasks.csv', 'empty.csv']");
  });
});
