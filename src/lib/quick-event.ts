/**
 * One-line event entry for the Calendar: "Lunch with Hana tomorrow 1pm 1h",
 * "Standup weekdays 9:30-9:45", "Site visit fri 10am @ Bole remind 30m",
 * "Public holiday nov 3 all day". Pure and deterministic: it reads only
 * the text and the person's "today", and leaves anything it doesn't
 * recognise in the title, so nothing is guessed silently.
 */
import { addDays, weekdayOf } from "./dates";

export type QuickEvent = {
  title: string;
  allDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  recurrenceRule: string;
  location: string;
  /** Minutes before the start to remind, if asked for. */
  remindMinutes: number | null;
  /** Human summary of what was understood, for the preview line. */
  understood: string[];
};

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_RE = "(sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)";
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

const dayIndex = (s: string) => DAYS.findIndex((d) => d.startsWith(s.slice(0, 3)));
const pad = (n: number) => String(n).padStart(2, "0");

/** Next date on weekday `d`, today included unless `skipToday`. */
function nextWeekday(today: string, d: number, skipToday = false): string {
  let diff = (d - weekdayOf(today) + 7) % 7;
  if (diff === 0 && skipToday) diff = 7;
  return addDays(today, diff);
}

/** "3pm", "3:30pm", "15:00", "9" (with a meridiem hint) → "HH:MM", or null. */
function toTime(h: string, m: string | undefined, ap: string | undefined, hintPm = false): string | null {
  let hour = Number(h);
  const min = m ? Number(m) : 0;
  if (min > 59) return null;
  const mer = ap?.toLowerCase();
  if (mer) {
    if (hour < 1 || hour > 12) return null;
    if (mer.startsWith("p") && hour !== 12) hour += 12;
    if (mer.startsWith("a") && hour === 12) hour = 0;
  } else if (hintPm && hour < 12) hour += 12;
  if (hour > 23) return null;
  return `${pad(hour)}:${pad(min)}`;
}

function plusMinutes(date: string, time: string, minutes: number) {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const t = ((total % 1440) + 1440) % 1440;
  return { date: addDays(date, Math.floor(total / 1440)), time: `${pad(Math.floor(t / 60))}:${pad(t % 60)}` };
}

function durationMinutes(n: string, unit: string): number {
  const v = Number(n);
  return Math.round(unit.startsWith("h") ? v * 60 : v);
}

export function parseQuickEvent(input: string, today: string): QuickEvent | null {
  let s = ` ${input.trim().replace(/\s+/g, " ")} `;
  const understood: string[] = [];
  const take = (re: RegExp): RegExpMatchArray | null => {
    const m = s.match(re);
    if (m) s = s.replace(m[0], " ");
    return m;
  };

  // Reminder: "remind 15m", "remind me 1h before".
  let remindMinutes: number | null = null;
  const rem = take(/ remind(?: me)? (\d+(?:\.\d+)?) ?(m|min|mins|minutes|h|hr|hrs|hours?)(?: before)? /i);
  if (rem) remindMinutes = durationMinutes(rem[1], rem[2].toLowerCase());

  // Location: everything after " @ ".
  let location = "";
  const at = s.match(/ @\s?(.+)$/);
  if (at) { location = at[1].trim(); s = s.slice(0, at.index) + " "; }

  // Repeat.
  let rule = "";
  let date: string | null = null;
  const everyDay = take(new RegExp(` every ${DAY_RE} `, "i"));
  if (everyDay) {
    const d = dayIndex(everyDay[1].toLowerCase());
    rule = `FREQ=WEEKLY;BYDAY=${CODES[d]}`;
    date = nextWeekday(today, d);
  } else if (take(/ (?:every weekday|weekdays) /i)) rule = "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
  else if (take(/ (?:every day|daily) /i)) rule = "FREQ=DAILY";
  else if (take(/ (?:every week|weekly) /i)) rule = "FREQ=WEEKLY";
  else if (take(/ (?:every month|monthly) /i)) rule = "FREQ=MONTHLY";
  else if (take(/ (?:every year|yearly|annually) /i)) rule = "FREQ=YEARLY";

  const allDay = !!take(/ all[- ]day /i);

  // Date.
  if (!date) {
    let m: RegExpMatchArray | null;
    if (take(/ today /i)) date = today;
    else if (take(/ (?:tomorrow|tmr|tmrw) /i)) date = addDays(today, 1);
    else if ((m = take(/ in (\d{1,3}) days? /i))) date = addDays(today, Number(m[1]));
    else if ((m = take(new RegExp(` next ${DAY_RE} `, "i")))) date = nextWeekday(today, dayIndex(m[1].toLowerCase()), true);
    else if ((m = take(/ (\d{4})-(\d{2})-(\d{2}) /))) date = `${m[1]}-${m[2]}-${m[3]}`;
    else if ((m = take(new RegExp(` ${MONTH_RE} (\\d{1,2})(?:st|nd|rd|th)? `, "i"))) || (m = take(new RegExp(` (\\d{1,2})(?:st|nd|rd|th)? ${MONTH_RE} `, "i")))) {
      const monthText = /\d/.test(m[1]) ? m[2] : m[1];
      const dayText = /\d/.test(m[1]) ? m[1] : m[2];
      const mon = MONTHS.indexOf(monthText.toLowerCase().slice(0, 3)) + 1;
      const day = Number(dayText);
      let y = Number(today.slice(0, 4));
      let k = `${y}-${pad(mon)}-${pad(day)}`;
      if (k < today) { y += 1; k = `${y}-${pad(mon)}-${pad(day)}`; }
      // Reject impossible dates like feb 31.
      if (day >= 1 && day <= 31 && addDays(k, 0) === k) date = k;
    } else if ((m = take(new RegExp(` (?:on )?${DAY_RE} `, "i")))) date = nextWeekday(today, dayIndex(m[1].toLowerCase()));
  }

  // Time: a range first, then a single time.
  let start: string | null = null;
  let end: string | null = null;
  const T = "(\\d{1,2})(?::(\\d{2}))? ?(am|pm|a\\.m\\.|p\\.m\\.)?";
  const range = take(new RegExp(` (?:at |from )?${T} ?(?:-|–|to|until) ?${T} `, "i"));
  if (range) {
    // "2-3pm": the meridiem on the end applies to the start too.
    const endPm = range[6]?.toLowerCase().startsWith("p");
    start = toTime(range[1], range[2], range[3] ?? (range[6] && Number(range[1]) <= Number(range[4]) ? range[6] : undefined));
    end = toTime(range[4], range[5], range[6]);
    if (start && end && end <= start && !range[3] && endPm === false) start = null;
  } else {
    const one = take(new RegExp(` (?:at )?(\\d{1,2})(?::(\\d{2}))? ?(am|pm|a\\.m\\.|p\\.m\\.) `, "i")) ?? take(/ (?:at )?(\d{1,2}):(\d{2}) /) ?? take(/ at (\d{1,2}) /i);
    if (one) start = toTime(one[1], one[2], one[3]);
  }

  // Duration: "30m", "1h", "1.5h", "for 2 hours".
  let minutes = 60;
  const dur = take(/ (?:for )?(\d+(?:\.\d+)?) ?(m|min|mins|minutes|h|hr|hrs|hours?) /i);
  if (dur) minutes = Math.max(5, Math.min(24 * 60, durationMinutes(dur[1], dur[2].toLowerCase())));

  const title = s.trim().replace(/\s+[-–,]$/, "");
  if (!title) return null;

  // "Standup weekdays" typed on a Saturday starts on Monday, not today.
  let startDate = date ?? today;
  const byDay = rule.match(/BYDAY=([A-Z,]+)/)?.[1].split(",");
  if (!date && byDay) while (!byDay.includes(CODES[weekdayOf(startDate)])) startDate = addDays(startDate, 1);
  if (startDate !== today) date = startDate;
  const timed = !allDay && !!start;
  let endDate = startDate;
  let endTime = "";
  if (timed) {
    if (end && end > start!) endTime = end;
    else { const e = plusMinutes(startDate, start!, minutes); endDate = e.date; endTime = e.time; }
  }

  if (date) understood.push(date === today ? "today" : startDate);
  if (timed) understood.push(`${start}–${endTime}${endDate !== startDate ? " (next day)" : ""}`);
  else understood.push("all day");
  if (rule) understood.push(rule === "FREQ=DAILY" ? "every day" : rule.startsWith("FREQ=WEEKLY;BYDAY=MO,TU") ? "weekdays" : rule.startsWith("FREQ=WEEKLY") ? "weekly" : rule === "FREQ=MONTHLY" ? "monthly" : "yearly");
  if (location) understood.push(`@ ${location}`);
  if (remindMinutes !== null && timed) understood.push(`reminder ${remindMinutes} min before`);

  return {
    title, allDay: !timed, startDate, startTime: timed ? start! : "", endDate, endTime,
    recurrenceRule: rule, location, remindMinutes: timed ? remindMinutes : null, understood,
  };
}

/** Local date and time to remind at, `remindMinutes` before the start. */
export function quickReminderAt(e: Pick<QuickEvent, "startDate" | "startTime" | "remindMinutes">): { date: string; time: string } | null {
  if (e.remindMinutes === null || !e.startTime) return null;
  return plusMinutes(e.startDate, e.startTime, -e.remindMinutes);
}
