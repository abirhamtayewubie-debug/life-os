import { describe, expect, it } from "vitest";
import { parseQuickEvent } from "@/lib/quick-event";

const TODAY = "2026-10-24"; // Saturday
const p = (s: string) => parseQuickEvent(s, TODAY)!;

describe("quick event entry", () => {
  it("reads a day, a time and a duration", () => {
    expect(p("Lunch with Hana tomorrow 1pm 90m")).toMatchObject({ title: "Lunch with Hana", startDate: "2026-10-25", startTime: "13:00", endDate: "2026-10-25", endTime: "14:30", allDay: false });
  });
  it("reads ranges, including a shared am/pm", () => {
    expect(p("Standup weekdays 9:30-9:45")).toMatchObject({ title: "Standup", startTime: "09:30", endTime: "09:45", recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", startDate: "2026-10-26", endDate: "2026-10-26" });
    expect(p("Review mon 2-3pm")).toMatchObject({ title: "Review", startDate: "2026-10-26", startTime: "14:00", endTime: "15:00" });
  });
  it("defaults to an hour, and to all day without a time", () => {
    expect(p("Call bank at 16:00")).toMatchObject({ startDate: TODAY, startTime: "16:00", endTime: "17:00" });
    expect(p("Public holiday nov 3")).toMatchObject({ title: "Public holiday", startDate: "2026-11-03", allDay: true, startTime: "" });
    expect(p("Trip 3 nov all day")).toMatchObject({ startDate: "2026-11-03", allDay: true });
  });
  it("rolls a past month-day into next year and next weekday forward", () => {
    expect(p("Renewal jan 5").startDate).toBe("2027-01-05");
    expect(p("Gym sat 7am").startDate).toBe(TODAY);
    expect(p("Gym next sat 7am").startDate).toBe("2026-10-31");
    expect(p("Dinner in 3 days 7pm").startDate).toBe("2026-10-27");
  });
  it("reads repeats, location and a reminder", () => {
    const e = p("Site visit every friday 10am @ Bole, Addis remind 30m");
    expect(e).toMatchObject({ title: "Site visit", startDate: "2026-10-30", startTime: "10:00", recurrenceRule: "FREQ=WEEKLY;BYDAY=FR", location: "Bole, Addis", remindMinutes: 30 });
  });
  it("runs past midnight onto the next day", () => {
    expect(p("Night shift 11pm 2h")).toMatchObject({ startTime: "23:00", endDate: "2026-10-25", endTime: "01:00" });
  });
  it("keeps what it doesn't understand in the title, and needs a title", () => {
    expect(p("Read chapter 12").title).toBe("Read chapter 12");
    expect(parseQuickEvent("tomorrow 3pm", TODAY)).toBeNull();
    expect(p("Feb 31 thing").title).toBe("thing");
  });
});
