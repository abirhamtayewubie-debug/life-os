/**
 * SAMPLE DATA — the only place in the codebase that invents records.
 *
 * Every row is tagged source = 'sample'. It powers demo mode (no database) and
 * the optional "Load sample data" action, and is removed in one step by
 * public.purge_sample_data(). Never import this from production read paths
 * except through those two entry points.
 */
import { addDays, localDateKey, weekdayOf, zonedTimeToUtc } from "./dates";
import type { RawLifeData } from "@/features/dashboard/types";
import { fromMinor, toMinor } from "./money";

const S = "sample" as const;

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic UUID-shaped ids so demo renders are stable across requests. */
function idFactory(seed: number | "random") {
  if (seed === "random") return () => crypto.randomUUID();
  const r = rng(seed);
  return () => {
    const hex = Array.from({ length: 32 }, () => Math.floor(r() * 16).toString(16)).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  };
}

export type SampleSet = ReturnType<typeof generateSampleSet>;

/**
 * `ids` is a fixed seed in demo mode, so ids are the same on every request.
 * Stored sample rows use "random": ids are global primary keys, so two
 * accounts loading samples must never get the same ones.
 */
export function generateSampleSet(now: Date, tz: string, baseCurrency = "ETB", ids: number | "random" = 42) {
  const id = idFactory(ids);
  const rand = rng(7);
  const today = localDateKey(now, tz);
  const at = (dayOffset: number, time: string) => zonedTimeToUtc(addDays(today, dayOffset), time, tz).toISOString();
  const createdLongAgo = at(-60, "08:00");

  // Wheel of Life ------------------------------------------------------------
  const wheelNames = [
    "Health & fitness", "Mind & emotions", "Family & relationships", "Career & work", "Finances",
    "Learning & growth", "Spirituality & purpose", "Recreation & fun", "Home & environment", "Contribution",
  ];
  const wheel_categories = wheelNames.map((name, i) => ({ id: id(), name, sort_order: i, source: S }));
  const wc = (name: string) => wheel_categories.find((c) => c.name.startsWith(name))!.id;
  const prevScores = [5, 6, 7, 7, 5, 6, 7, 4, 6, 5];
  const currScores = [6, 6, 8, 7, 5, 7, 7, 4, 7, 5];
  const desired = [8, 8, 9, 8, 8, 8, 8, 7, 8, 7];
  const wheel_assessments = [
    { id: id(), assessed_on: addDays(today, -95), note: null, source: S },
    { id: id(), assessed_on: addDays(today, -6), note: "Quarterly check-in", source: S },
  ];
  const wheel_ratings = wheel_categories.flatMap((c, i) => [
    { id: id(), assessment_id: wheel_assessments[0].id, category_id: c.id, score: prevScores[i], desired_score: desired[i] },
    { id: id(), assessment_id: wheel_assessments[1].id, category_id: c.id, score: currScores[i], desired_score: desired[i] },
  ]);

  // Goals & projects ---------------------------------------------------------
  const vision = { id: id(), parent_id: null as string | null, wheel_category_id: null as string | null, level: "vision" as const, title: "Live a healthy, purposeful life with financial freedom", status: "active" as const, target_date: null as string | null, metric_label: null as string | null, metric_target: null as string | null, metric_current: null as string | null, source: S };
  const g = (title: string, level: "long_term" | "annual" | "quarterly", parent: string | null, cat: string | null, target: number | null, current: number | null, label: string | null, due: number | null) => ({
    id: id(), parent_id: parent, wheel_category_id: cat, level, title, status: "active" as const,
    target_date: due === null ? null : addDays(today, due), metric_label: label,
    metric_target: target === null ? null : String(target), metric_current: current === null ? null : String(current), source: S,
  });
  const gHealth = g("Run a 10K comfortably", "annual", vision.id, wc("Health"), 10, 6.5, "km", 120);
  const gSave = g("Build a 6-month emergency fund", "annual", vision.id, wc("Finances"), 180000, 76500, baseCurrency, 200);
  const gPortfolio = g("Publish a design & construction portfolio", "quarterly", vision.id, wc("Career"), 8, 3, "case studies", 40);
  const gEnglish = g("Speak confidently in client presentations", "quarterly", vision.id, wc("Learning"), 24, 15, "practice sessions", 55);
  const goals = [vision, gHealth, gSave, gPortfolio, gEnglish];

  const p = (name: string, area: string, goal: string | null, due: number) => ({
    id: id(), goal_id: goal, name, status: "active" as const, area, due_date: addDays(today, due), source: S,
  });
  const pBrand = p("Client brand identity — café rebrand", "work", gPortfolio.id, 5);
  const pSite = p("Residential site assessment report", "work", null, 12);
  const pKitchen = p("Kitchen renovation plan", "home", null, 34);
  const projects = [pBrand, pSite, pKitchen];

  // Tasks ---------------------------------------------------------------------
  type T = {
    id: string; title: string; status: "todo" | "in_progress" | "waiting" | "done"; priority: 1 | 2 | 3 | 4; area: string;
    due_date: string | null; due_at: string | null; is_top_priority: boolean; completed_at: string | null;
    project_id: string | null; goal_id: string | null; created_at: string; source: typeof S;
  };
  const t = (title: string, o: Partial<T> = {}): T => ({
    id: id(), title, status: "todo", priority: 3, area: "personal", due_date: null, due_at: null, is_top_priority: false,
    completed_at: null, project_id: null, goal_id: null, created_at: createdLongAgo, source: S, ...o,
  });
  const done = (dayOffset: number, time = "16:30") => ({ status: "done" as const, completed_at: at(dayOffset, time) });
  const tasks: T[] = [
    t("Finalise logo concepts for café rebrand review", { priority: 1, area: "work", is_top_priority: true, project_id: pBrand.id, due_at: at(0, "15:00"), status: "in_progress" }),
    t("Send site assessment photos to structural engineer", { priority: 2, area: "work", is_top_priority: true, project_id: pSite.id, due_date: today }),
    t("30-minute English speaking practice", { priority: 2, is_top_priority: true, goal_id: gEnglish.id, due_date: today, area: "learning" }),
    t("Pay internet bill", { priority: 2, area: "finance", due_date: addDays(today, -1) }),
    t("Reply to landlord about lease renewal", { priority: 2, area: "home", due_date: addDays(today, -4) }),
    t("Draft colour palette options", { priority: 3, area: "work", project_id: pBrand.id, due_date: addDays(today, 1) }),
    t("Measure kitchen wall dimensions", { priority: 3, area: "home", project_id: pKitchen.id, due_date: addDays(today, 3) }),
    t("Book dentist appointment", { priority: 3, area: "health", due_date: addDays(today, -6) }),
    t("Write case study: community library facade", { priority: 3, area: "work", goal_id: gPortfolio.id, due_date: addDays(today, 6) }),
    t("Compile load calculations appendix", { priority: 2, area: "work", project_id: pSite.id, due_date: addDays(today, 8) }),
    t("Call grandmother", { priority: 3, area: "family", due_date: addDays(today, 2) }),
    t("Moodboard for café interior", { ...done(-1, "11:00"), area: "work", project_id: pBrand.id }),
    t("Client kickoff notes", { ...done(-9), area: "work", project_id: pBrand.id }),
    t("Typography exploration", { ...done(-1, "17:45"), area: "work", project_id: pBrand.id }),
    t("Site visit and photo survey", { ...done(-3), area: "work", project_id: pSite.id }),
    t("Long run — 6.5 km", { ...done(-2, "07:30"), area: "health", goal_id: gHealth.id }),
    t("Transfer savings for the month", { ...done(-5), area: "finance", goal_id: gSave.id }),
    t("Collect contractor quotes", { area: "home", project_id: pKitchen.id, due_date: addDays(today, 14), status: "waiting" }),
  ];

  // Calendar -------------------------------------------------------------------
  const e = (title: string, day: number, start: string, end: string, kind: "event" | "meeting" | "appointment" | "time_block", location: string | null = null) => ({
    id: id(), title, kind, starts_at: at(day, start), ends_at: at(day, end), all_day: false, location, timezone: tz, source: S,
  });
  const calendar_events = [
    e("Deep work: logo concepts", 0, "09:00", "11:00", "time_block"),
    e("Café rebrand review", 0, "14:00", "15:00", "meeting", "Video call"),
    e("Coffee with Hana", 0, "14:30", "15:15", "event", "Tomoca, Piassa"),
    e("Gym — strength", 0, "18:30", "19:30", "event"),
    e("Site meeting with engineer", 1, "10:00", "11:30", "meeting", "Bole site"),
    e("English conversation club", 2, "18:00", "19:00", "event"),
    e("Dentist check-up", 4, "09:30", "10:15", "appointment"),
    e("Family dinner", 5, "19:00", "21:00", "event"),
    { id: id(), title: "Public holiday", kind: "event" as const, starts_at: addDays(today, 6), ends_at: addDays(today, 6), all_day: true, location: null, timezone: tz, source: S },
  ];

  const reminders = [
    { id: id(), title: "Take vitamins", remind_at: at(0, "08:00"), timezone: tz, status: "scheduled" as const, snoozed_until: null as string | null, source: S },
    { id: id(), title: "Submit weekly timesheet", remind_at: at(0, "17:00"), timezone: tz, status: "scheduled" as const, snoozed_until: null, source: S },
    { id: id(), title: "Water the plants", remind_at: at(-1, "19:00"), timezone: tz, status: "snoozed" as const, snoozed_until: at(0, "19:00"), source: S },
  ];

  // Habits ----------------------------------------------------------------------
  const h = (name: string, time: "morning" | "afternoon" | "evening" | "anytime", days: number[], hit: number, goal: string | null, cat: string | null) => ({
    id: id(), goal_id: goal, wheel_category_id: cat, name, cadence: "daily" as const, schedule_days: days, target_per_period: 1,
    time_of_day: time, paused_at: null as string | null, created_at: createdLongAgo, source: S, hit,
  });
  const habitDefs = [
    h("Morning prayer & reflection", "morning", [0, 1, 2, 3, 4, 5, 6], 0.9, null, wc("Spirituality")),
    h("Read 20 pages", "evening", [0, 1, 2, 3, 4, 5, 6], 0.7, gEnglish.id, wc("Learning")),
    h("Workout", "evening", [1, 3, 5], 0.75, gHealth.id, wc("Health")),
    h("No phone after 22:00", "evening", [0, 1, 2, 3, 4, 5, 6], 0.4, null, wc("Mind")),
    h("Log expenses", "evening", [0, 1, 2, 3, 4, 5, 6], 0.8, gSave.id, wc("Finances")),
  ];
  const habit_logs: { id: string; habit_id: string; log_date: string; count: number; source: typeof S }[] = [];
  for (const hd of habitDefs) {
    for (let i = 45; i >= 0; i--) {
      const k = addDays(today, -i);
      if (!hd.schedule_days.includes(weekdayOf(k))) continue;
      const doneToday = i === 0 ? hd.time_of_day === "morning" : rand() < hd.hit;
      if (doneToday) habit_logs.push({ id: id(), habit_id: hd.id, log_date: k, count: 1, source: S });
    }
  }
  const habits = habitDefs.map(({ hit: _hit, ...rest }) => rest);

  // Finance --------------------------------------------------------------------
  const acct = (name: string, kind: string, currency: string, opening: string) => ({
    id: id(), name, kind, currency, opening_balance: opening, opening_date: addDays(today, -90), source: S,
  });
  const aBank = acct("CBE Current", "checking", "ETB", "48250.00");
  const aCash = acct("Cash wallet", "cash", "ETB", "3200.00");
  const aSave = acct("Emergency savings", "savings", "ETB", "76500.00");
  const aUsd = acct("USD Payoneer", "checking", "USD", "1240.00");
  const financial_accounts = [aBank, aCash, aSave, aUsd];

  const cat = (name: string, kind: "income" | "expense") => ({ id: id(), parent_id: null as string | null, kind, name, source: S });
  const cFood = cat("Groceries", "expense");
  const cDining = cat("Dining out", "expense");
  const cTransport = cat("Transport", "expense");
  const cUtilities = cat("Utilities & internet", "expense");
  const cHome = cat("Home", "expense");
  const cSalary = cat("Client income", "income");
  const transaction_categories = [cFood, cDining, cTransport, cUtilities, cHome, cSalary];

  const monthStart = `${today.slice(0, 7)}-01`;
  const transactions: { id: string; account_id: string; category_id: string | null; kind: "income" | "expense"; amount: string; currency: string; occurred_on: string; description: string; source: typeof S }[] = [];
  const tx = (account: { id: string; currency: string }, category: { id: string } | null, kind: "income" | "expense", amount: number, day: number, description: string) => {
    const occurred_on = addDays(today, -day);
    const v = kind === "expense" ? -Math.abs(amount) : Math.abs(amount);
    transactions.push({ id: id(), account_id: account.id, category_id: category?.id ?? null, kind, amount: v.toFixed(2), currency: account.currency, occurred_on, description, source: S });
  };
  const dayOfMonth = Number(today.slice(8, 10));
  for (let d = 0; d < Math.max(dayOfMonth, 1); d++) {
    if (d % 3 === 0) tx(aBank, cFood, "expense", 600 + Math.round(rand() * 900), d, "Supermarket");
    if (d % 4 === 1) tx(aCash, cDining, "expense", 350 + Math.round(rand() * 500), d, "Lunch");
    if (d % 2 === 0) tx(aCash, cTransport, "expense", 80 + Math.round(rand() * 160), d, "Ride");
  }
  tx(aBank, cUtilities, "expense", 1450, Math.min(dayOfMonth - 1, 4), "Electricity & water");
  tx(aBank, cHome, "expense", 2300, Math.min(dayOfMonth - 1, 8), "Kitchen sample tiles");
  tx(aUsd, cSalary, "income", 850, Math.min(dayOfMonth - 1, 10), "Brand identity — deposit");
  tx(aBank, cSalary, "income", 32000, Math.min(dayOfMonth - 1, 12), "Site assessment — stage 1");
  // keep last month too, for "changes" and trend charts
  for (let d = dayOfMonth; d < dayOfMonth + 25; d += 3) tx(aBank, cFood, "expense", 700 + Math.round(rand() * 600), d, "Supermarket");

  const budget = { id: id(), name: "Monthly spending", period: "monthly" as const, currency: "ETB", starts_on: monthStart, source: S };
  const budget_lines = [
    { id: id(), budget_id: budget.id, category_id: cFood.id, amount: "9000.00" },
    { id: id(), budget_id: budget.id, category_id: cDining.id, amount: "3500.00" },
    { id: id(), budget_id: budget.id, category_id: cTransport.id, amount: "2500.00" },
    { id: id(), budget_id: budget.id, category_id: cUtilities.id, amount: "2000.00" },
    { id: id(), budget_id: budget.id, category_id: cHome.id, amount: "4000.00" },
  ];

  const exchange_rates = [
    { id: id(), base: "USD", quote: "ETB", rate: "125.5", as_of: addDays(today, -3), source: S },
  ];
  const rec = (account: { id: string; currency: string }, category: { id: string } | null, description: string, amount: string, dueIn: number, unit: "week" | "month" | "year", kind: { is_bill?: boolean; is_subscription?: boolean }) => ({
    id: id(), account_id: account.id, category_id: category?.id ?? null, currency: account.currency, description, amount, every_n: 1, unit,
    next_due_on: addDays(today, dueIn), is_bill: !!kind.is_bill, is_subscription: !!kind.is_subscription, remind_days_before: 3, autopay: false, source: S,
  });
  const recurring_transactions = [
    rec(aBank, cUtilities, "Internet (Ethio Telecom)", "-1200.00", 2, "month", { is_bill: true }),
    rec(aBank, cHome, "Rent", "-15000.00", 11, "month", { is_bill: true }),
    rec(aUsd, null, "Design software", "-22.99", 6, "month", { is_subscription: true }),
  ];
  const savings_goals = [
    { id: id(), goal_id: gSave.id as string | null, account_id: aSave.id as string | null, name: "Emergency fund", target_amount: "180000.00", currency: "ETB", saved_amount: "0", target_date: addDays(today, 200) as string | null, source: S },
  ];

  // Wellness & sleep -------------------------------------------------------------
  const wellness_logs = Array.from({ length: 7 }, (_, i) => ({
    id: id(), log_date: addDays(today, -6 + i), logged_at: at(-6 + i, "21:00"),
    mood: [3, 4, 3, 4, 2, 4, 4][i], energy: [3, 3, 2, 4, 2, 3, 4][i], stress: [3, 2, 3, 2, 4, 2, 2][i], source: S,
  })).filter((w) => w.log_date < today);

  const sleepPlan = [[-6, "23:40", "06:30", 3], [-5, "00:15", "06:30", 2], [-4, "23:10", "06:45", 4], [-3, "23:55", "06:30", 3], [-2, "22:50", "06:40", 4], [-1, "23:30", "06:35", 3], [0, "23:20", "06:50", 4]] as const;
  const sleep_logs = sleepPlan.map(([day, bed, wake, q]) => {
    const bedDay = bed < "12:00" ? day : day - 1;
    const bedtime = at(bedDay, bed);
    const wake_time = at(day, wake);
    return {
      id: id(), sleep_date: addDays(today, day), bedtime, wake_time,
      duration_minutes: Math.round((new Date(wake_time).getTime() - new Date(bedtime).getTime()) / 60000), quality: q, source: S,
    };
  });

  // Journal, notes, reviews -------------------------------------------------------
  const journal_entries = [
    { id: id(), entry_date: addDays(today, -1), kind: "gratitude", title: "Three good things", body: "Sample entry.", is_private: true, source: S },
    { id: id(), entry_date: addDays(today, -2), kind: "reflection", title: "What made the site visit go well", body: "Sample entry.", is_private: true, source: S },
    { id: id(), entry_date: addDays(today, -4), kind: "journal", title: null, body: "Sample entry.", is_private: true, source: S },
  ];
  const nFeedback = { id: id(), title: "Café rebrand — client feedback round 1", kind: "meeting", folder: "Clients", url: null as string | null, pinned: true, project_id: pBrand.id as string | null, goal_id: null as string | null, body: "Sample note. They liked direction B. Next: refine the palette, see [[Brand colour principles]].", updated_at: at(-1, "12:10"), source: S };
  const nColours = { id: id(), title: "Brand colour principles", kind: "reference", folder: "Design", url: null as string | null, pinned: false, project_id: null as string | null, goal_id: null as string | null, body: "Sample note. Start from two neutrals and one accent. Check contrast before presenting.", updated_at: at(-6, "09:00"), source: S };
  const nWindows = { id: id(), title: "Decision: timber vs. aluminium window frames", kind: "decision", folder: "Construction", url: null as string | null, pinned: false, project_id: null as string | null, goal_id: null as string | null, body: "Sample note. Chose aluminium for the rental unit: lower upkeep.", updated_at: at(-3, "18:00"), source: S };
  const nPhrases = { id: id(), title: "Presentation phrases to practise", kind: "learning", folder: "English", url: null as string | null, pinned: false, project_id: null as string | null, goal_id: gEnglish.id as string | null, body: "Sample note. Openers and transitions. Use these when presenting [[Café rebrand — client feedback round 1]].", updated_at: at(-5, "20:30"), source: S };
  const notes = [nFeedback, nColours, nWindows, nPhrases];
  const note_links = [
    { id: id(), from_type: "note" as const, from_id: nFeedback.id, to_type: "note" as const, to_id: nColours.id },
    { id: id(), from_type: "note" as const, from_id: nPhrases.id, to_type: "note" as const, to_id: nFeedback.id },
  ];
  const daily_reviews = [
    { id: id(), review_date: addDays(today, -1), kind: "evening" as const, achievements: "Typography exploration done; good run.", unfinished: "Internet bill", tomorrow_priorities: ["Logo concepts", "Send site photos", "Pay internet bill"], mood: 4, energy: 3, notes: null as string | null, source: S },
  ];

  // Phase 3: milestones, time, people, learning, admin, values ------------------
  const ms = (title: string, project: string | null, goal: string | null, due: number, doneDay: number | null, order: number) => ({
    id: id(), project_id: project, goal_id: goal, title, due_date: addDays(today, due),
    completed_at: doneDay === null ? null : at(doneDay, "17:00"), sort_order: order, source: S,
  });
  const milestones = [
    ms("Moodboard approved", pBrand.id, null, -4, -4, 0),
    ms("Logo concepts presented", pBrand.id, null, 0, null, 1),
    ms("Brand guidelines delivered", pBrand.id, null, 5, null, 2),
    ms("Site survey complete", pSite.id, null, -2, -2, 0),
    ms("Draft report to engineer", pSite.id, null, 8, null, 1),
    ms("First 5K under 30 min", null, gHealth.id, -20, -21, 0),
    ms("8K long run", null, gHealth.id, 30, null, 1),
    ms("3 months saved", null, gSave.id, 45, null, 0),
  ];
  const te = (project: string, day: number, start: string, minutes: number, note: string | null) => {
    const s0 = at(day, start);
    return { id: id(), project_id: project, task_id: null as string | null, started_at: s0, ended_at: new Date(new Date(s0).getTime() + minutes * 60000).toISOString(), note, source: S };
  };
  const time_entries = [
    te(pBrand.id, -1, "09:00", 150, "Typography exploration"), te(pBrand.id, -2, "14:00", 90, "Moodboard revisions"),
    te(pSite.id, -2, "10:00", 180, "Site survey"), te(pSite.id, -3, "15:00", 60, "Photo sorting"), te(pBrand.id, -4, "09:30", 120, null),
  ];
  const person = (name: string, relationship: string, birthdayOffset: number | null, every: number | null, notes: string | null) => ({
    id: id(), name, relationship, birthday: birthdayOffset === null ? null : `1992-${addDays(today, birthdayOffset).slice(5)}`,
    contact_every_days: every, notes, source: S,
  });
  const hana = person("Hana", "Friend", 18, 14, null);
  const grandma = person("Grandmother", "Family", 52, 7, "Likes hearing about the kitchen project.");
  const dawit = person("Dawit", "Mentor", null, 30, null);
  const people = [hana, grandma, dawit];
  const interactions = [
    { id: id(), person_id: hana.id, occurred_on: addDays(today, -3), kind: "message" as const, note: null as string | null, source: S },
    { id: id(), person_id: grandma.id, occurred_on: addDays(today, -9), kind: "call" as const, note: null, source: S },
    { id: id(), person_id: dawit.id, occurred_on: addDays(today, -41), kind: "meal" as const, note: "Talked about pricing consulting work.", source: S },
  ];
  const important_dates = [
    { id: id(), person_id: null as string | null, kind: "anniversary" as const, title: "Studio founding anniversary", date: `2020-${addDays(today, 26).slice(5)}`, recurs_yearly: true, remind_days_before: 7, source: S },
  ];
  const learning_items = [
    { id: id(), goal_id: gEnglish.id, kind: "course" as const, title: "Business English: presentations", author: null as string | null, url: null as string | null, status: "in_progress" as const, progress_pct: 60, started_on: addDays(today, -40), finished_on: null as string | null, notes: null as string | null, source: S },
    { id: id(), goal_id: null as string | null, kind: "book" as const, title: "Thinking with Type", author: "Ellen Lupton", url: null, status: "in_progress" as const, progress_pct: 35, started_on: addDays(today, -20), finished_on: null, notes: null, source: S },
    { id: id(), goal_id: null as string | null, kind: "book" as const, title: "Building Construction Illustrated", author: "Francis D. K. Ching", url: null, status: "completed" as const, progress_pct: 100, started_on: addDays(today, -120), finished_on: addDays(today, -60), notes: null, source: S },
    { id: id(), goal_id: gHealth.id, kind: "video" as const, title: "Running form basics", author: null, url: null, status: "planned" as const, progress_pct: null as number | null, started_on: null, finished_on: null, notes: null, source: S },
  ];
  const skills = [
    { id: id(), name: "Public speaking (English)", area: "learning", level: 3, target_level: 4, notes: null as string | null, source: S },
    { id: id(), name: "Brand identity design", area: "work", level: 4, target_level: 5, notes: null, source: S },
    { id: id(), name: "Structural load calculations", area: "work", level: 2, target_level: 4, notes: null, source: S },
  ];
  const admin = (kind: "renewal" | "document" | "record", title: string, category: string, due: number | null, repeat: number | null, location: string | null) => ({
    id: id(), kind, title, category, due_on: due === null ? null : addDays(today, due), repeat_months: repeat, remind_days_before: 14,
    location, reference: null as string | null, notes: null as string | null, completed_at: null as string | null, source: S,
  });
  const admin_items = [
    admin("renewal", "Vehicle insurance", "Vehicle", 9, 12, null),
    admin("renewal", "Passport", "Identity", 210, null, "Home office, blue folder"),
    admin("renewal", "Business licence", "Work", 48, 12, null),
    admin("document", "Land title deed (copy)", "Home", null, null, "Home office, fire-safe box"),
    admin("record", "Water heater serviced", "Home", -30, null, null),
  ];
  const personal_values = [
    { id: id(), name: "Faith", description: "Start and end the day grounded.", sort_order: 0, source: S },
    { id: id(), name: "Craft", description: "Do work I'm proud to sign.", sort_order: 1, source: S },
    { id: id(), name: "Family", description: null as string | null, sort_order: 2, source: S },
  ];

  return {
    wheel_categories, wheel_assessments, wheel_ratings, goals, projects, tasks, calendar_events, reminders,
    habits, habit_logs, financial_accounts, transaction_categories, transactions, budgets: [budget], budget_lines, exchange_rates, recurring_transactions, savings_goals,
    wellness_logs, sleep_logs, journal_entries, notes, note_links, daily_reviews,
    milestones, time_entries, people, interactions, important_dates, learning_items, skills, admin_items, personal_values,
  };
}

/** Converts a SampleSet into the dashboard's raw shape (as if read from the DB). */
export function sampleToRaw(s: SampleSet): RawLifeData {
  const balance = (accountId: string, currency: string, opening: string) => {
    let v = toMinor(opening, currency);
    for (const t of s.transactions) if (t.account_id === accountId) v += toMinor(t.amount, currency);
    return fromMinor(v, currency);
  };
  return {
    tasks: s.tasks,
    events: s.calendar_events,
    reminders: s.reminders,
    habits: s.habits,
    habitLogs: s.habit_logs,
    goals: s.goals.map((g) => ({ ...g, updated_at: g.target_date ?? "" })),
    projects: s.projects,
    accounts: s.financial_accounts.map((a) => ({
      id: a.id, name: a.name, kind: a.kind, currency: a.currency, is_liability: false,
      balance: balance(a.id, a.currency, a.opening_balance), source: a.source,
    })),
    categories: s.transaction_categories,
    budgets: s.budgets.map((b) => ({ ...b, lines: s.budget_lines.filter((l) => l.budget_id === b.id) })),
    transactions: s.transactions,
    wellness: s.wellness_logs,
    sleep: s.sleep_logs,
    wheelCategories: s.wheel_categories,
    wheelAssessments: s.wheel_assessments.map((a) => ({ ...a, ratings: s.wheel_ratings.filter((r) => r.assessment_id === a.id) })),
    journal: s.journal_entries,
    notes: s.notes,
    reviews: s.daily_reviews,
  };
}
