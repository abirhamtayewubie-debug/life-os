import { describe, expect, it } from "vitest";
import { bookPercent, finishedIn, isReadable, nextPage, pagesBetween, pagesIn } from "@/features/reflection/reading";

const book = { status: "in_progress" as const, progress_pct: 10, total_pages: 300, current_page: 75 };

describe("reading", () => {
  it("only books and articles are reading", () => {
    expect(isReadable({ kind: "book" })).toBe(true);
    expect(isReadable({ kind: "article" })).toBe(true);
    expect(isReadable({ kind: "course" })).toBe(false);
  });

  it("counts pages only when both ends were noted", () => {
    expect(pagesIn({ page_from: 41, page_to: 60 })).toBe(20);
    expect(pagesIn({ page_from: 41, page_to: null })).toBe(0);
    const s = [
      { studied_on: "2026-10-24", page_from: 1, page_to: 10 },
      { studied_on: "2026-10-19", page_from: 11, page_to: 30 },
      { studied_on: "2026-10-18", page_from: 31, page_to: 40 },
    ];
    expect(pagesBetween(s, "2026-10-19", "2026-10-25")).toBe(30);
  });

  it("uses pages for progress when known, else the progress you set", () => {
    expect(bookPercent(book)).toBe(25);
    expect(bookPercent({ ...book, total_pages: null })).toBe(10);
    expect(bookPercent({ ...book, status: "completed" })).toBe(100);
    expect(bookPercent({ ...book, current_page: null, progress_pct: null })).toBe(0);
  });

  it("starts the next session after the page you're on, never past the end", () => {
    expect(nextPage(book)).toBe(76);
    expect(nextPage({ current_page: null, total_pages: 300 })).toBe(1);
    expect(nextPage({ current_page: 300, total_pages: 300 })).toBe(300);
  });

  it("counts books finished in a year", () => {
    const items = [
      { kind: "book" as const, status: "completed" as const, finished_on: "2026-03-01" },
      { kind: "book" as const, status: "completed" as const, finished_on: "2025-12-30" },
      { kind: "course" as const, status: "completed" as const, finished_on: "2026-05-01" },
      { kind: "article" as const, status: "in_progress" as const, finished_on: null },
    ];
    expect(finishedIn(items, "2026")).toBe(1);
  });
});
