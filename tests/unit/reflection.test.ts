import { describe, expect, it } from "vitest";
import { embedUrl, practiceByWeek, practiceMinutes, practiceStreak, youtubeId } from "@/features/reflection/meditation";
import { periodLabel, periodOf, recentPeriods, reviewFor, suggestedPeriod } from "@/features/reflection/reviews";
import type { Review } from "@/features/reflection/types";

describe("youtube links", () => {
  it("reads the video id from the usual link shapes", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=inpok4MKVLM",
      "https://youtube.com/watch?v=inpok4MKVLM&t=30s",
      "https://m.youtube.com/watch?v=inpok4MKVLM",
      "https://youtu.be/inpok4MKVLM?si=abc",
      "https://www.youtube.com/shorts/inpok4MKVLM",
      "https://www.youtube.com/embed/inpok4MKVLM",
      "https://www.youtube.com/live/inpok4MKVLM?feature=share",
    ]) expect(youtubeId(url)).toBe("inpok4MKVLM");
  });

  it("rejects anything else", () => {
    for (const url of ["", "not a url", "https://vimeo.com/123", "https://www.youtube.com/watch?v=short", "https://evil.com/watch?v=inpok4MKVLM", "javascript:alert(1)", "https://youtube.com.evil.com/watch?v=inpok4MKVLM"]) {
      expect(youtubeId(url)).toBeNull();
    }
  });

  it("embeds with the privacy-enhanced player", () => {
    expect(embedUrl("inpok4MKVLM")).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/inpok4MKVLM\?/);
  });
});

describe("meditation practice", () => {
  const s = [
    { practiced_on: "2026-10-24", minutes: 10 },
    { practiced_on: "2026-10-23", minutes: 20 },
    { practiced_on: "2026-10-18", minutes: 5 },
  ];
  it("totals and streaks like study time", () => {
    expect(practiceMinutes(s, "2026-10-19", "2026-10-25")).toBe(30);
    expect(practiceStreak(s, "2026-10-24")).toBe(2);
    expect(practiceByWeek(s, "2026-10-24", 2)).toEqual([{ start: "2026-10-12", minutes: 5 }, { start: "2026-10-19", minutes: 30 }]);
  });
});

describe("review periods", () => {
  const review = (kind: "weekly" | "monthly", review_date: string): Review => ({
    id: review_date, review_date, kind, achievements: "x", unfinished: null, tomorrow_priorities: [], mood: null, energy: null, notes: null, source: "manual",
  });

  it("uses the week-start setting like Reports", () => {
    expect(periodOf("weekly", "2026-10-24", 1)).toEqual({ kind: "weekly", start: "2026-10-19", end: "2026-10-25" });
    expect(periodOf("weekly", "2026-10-24", 0)).toEqual({ kind: "weekly", start: "2026-10-18", end: "2026-10-24" });
    expect(periodOf("monthly", "2026-02-14", 1)).toEqual({ kind: "monthly", start: "2026-02-01", end: "2026-02-28" });
  });

  it("lists recent periods newest first, across a year end", () => {
    expect(recentPeriods("monthly", "2026-01-10", 1, 3).map((p) => p.start)).toEqual(["2026-01-01", "2025-12-01", "2025-11-01"]);
    expect(recentPeriods("weekly", "2026-10-24", 1, 2).map((p) => p.start)).toEqual(["2026-10-19", "2026-10-12"]);
  });

  it("suggests last period's review early on while it's missing", () => {
    expect(suggestedPeriod("weekly", [], "2026-10-20", 1).start).toBe("2026-10-12"); // Tuesday
    expect(suggestedPeriod("weekly", [review("weekly", "2026-10-12")], "2026-10-20", 1).start).toBe("2026-10-19");
    expect(suggestedPeriod("weekly", [], "2026-10-24", 1).start).toBe("2026-10-19"); // Saturday: this week
    expect(suggestedPeriod("monthly", [], "2026-11-03", 1).start).toBe("2026-10-01");
    expect(suggestedPeriod("monthly", [], "2026-11-12", 1).start).toBe("2026-11-01");
  });

  it("finds a saved review and labels periods", () => {
    const p = periodOf("monthly", "2026-10-24", 1);
    expect(reviewFor([review("weekly", "2026-10-01"), review("monthly", "2026-10-01")], p)?.kind).toBe("monthly");
    expect(periodLabel(p, "en-US")).toBe("October 2026");
    expect(periodLabel(periodOf("weekly", "2026-10-24", 1), "en-US")).toBe("Oct 19 – Oct 25");
  });
});
