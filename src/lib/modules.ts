import {
  BarChart3, BookOpen, Briefcase, CalendarDays, Flower2, GraduationCap, HeartPulse, House,
  LayoutDashboard, ListChecks, Moon, Orbit, Plug, Repeat, Settings, Sparkles, Target, Users, Wallet,
  type LucideIcon,
} from "lucide-react";

export type ModuleGroup = "overview" | "plan" | "life" | "reflect" | "system";

export type ModuleDef = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  group: ModuleGroup;
  /** Roadmap phase in which the module becomes fully functional. */
  phase: number;
  /** One line on what the module does, used in nav tooltips, ⌘K and empty states. */
  summary: string;
  /** Module cannot be hidden from navigation. */
  required?: boolean;
  /** What the module will let you do, shown on its page until it ships. */
  capabilities: string[];
};

export const MODULES: ModuleDef[] = [
  { key: "home", label: "Command Center", href: "/", icon: LayoutDashboard, group: "overview", phase: 1, required: true,
    summary: "Today at a glance: priorities, agenda, progress, and what changed.",
    capabilities: [] },
  { key: "assistant", label: "AI Assistant", href: "/assistant", icon: Sparkles, group: "overview", phase: 6,
    summary: "Ask questions across your own records, with evidence and confirmation before changes.",
    capabilities: ["Answers grounded in your records, with links to the evidence", "Facts, estimates and suggestions clearly separated", "Proposes tasks, events and plans; nothing changes until you confirm", "Per-module data permissions you control"] },
  { key: "calendar", label: "Calendar", href: "/calendar", icon: CalendarDays, group: "plan", phase: 2,
    summary: "Day, week, month and agenda views with time blocking and conflict detection.",
    capabilities: ["Day, week, month and agenda views", "Time-block tasks onto your calendar", "Conflict detection across events and blocks", "Time-zone aware recurring events"] },
  { key: "tasks", label: "Tasks & Reminders", href: "/tasks", icon: ListChecks, group: "plan", phase: 2,
    summary: "Priorities, due dates, subtasks, dependencies, recurring tasks and reminders.",
    capabilities: ["Priorities, tags, due dates and saved views", "Subtasks and dependencies", "Recurring tasks and reminders with snooze", "Links to goals and projects"] },
  { key: "goals", label: "Goals & Vision", href: "/goals", icon: Target, group: "plan", phase: 3,
    summary: "Life vision down to quarterly objectives, milestones and daily actions.",
    capabilities: ["Vision → long-term → annual → quarterly hierarchy", "Milestones and progress metrics", "Pause, revise or let go of goals without penalty", "AI help breaking ambitions into steps (Phase 6)"] },
  { key: "habits", label: "Habits & Routines", href: "/habits", icon: Repeat, group: "plan", phase: 2,
    summary: "Routines with flexible schedules and consistency rates, not just streaks.",
    capabilities: ["Daily or weekly targets on the days you choose", "Consistency rate alongside streaks", "Pause without losing history", "Morning and evening routines"] },
  { key: "finance", label: "Finance", href: "/finance", icon: Wallet, group: "life", phase: 4,
    summary: "Accounts, transactions, budgets, bills and net worth in ETB, USD, CAD and more.",
    capabilities: ["Accounts, wallets, transfers and categories", "Weekly and monthly budgets", "Bills, subscriptions and recurring items", "Multi-currency with explicit conversion rates", "CSV import and export"] },
  { key: "health", label: "Health & Fitness", href: "/health", icon: HeartPulse, group: "life", phase: 5,
    summary: "Workouts, measurements, nutrition and how you feel, manual or device-recorded.",
    capabilities: ["Workout plans, sets, reps and weights", "Body measurements and trends", "Mood, energy and wellness check-ins", "Manual vs device data always labelled"] },
  { key: "sleep", label: "Sleep & Recovery", href: "/sleep", icon: Moon, group: "life", phase: 5,
    summary: "Bedtime, wake time, duration and quality, with consistency trends.",
    capabilities: ["Bedtime, wake time and subjective quality", "Routine consistency", "Optional device imports", "Trends alongside your own mood and energy logs"] },
  { key: "work", label: "Work & Projects", href: "/work", icon: Briefcase, group: "life", phase: 3,
    summary: "Projects, milestones, Kanban, time tracking and weekly productivity.",
    capabilities: ["Projects with milestones and deadlines", "Kanban and timeline views", "Time tracking", "Project budgets linked to Finance"] },
  { key: "learning", label: "Learning", href: "/learning", icon: GraduationCap, group: "life", phase: 3,
    summary: "Books, courses and skills, with learning plans tied to your goals.",
    capabilities: ["Books, courses and resources", "Skills with current and target levels", "Learning plans linked to goals", "Notes and reflections"] },
  { key: "spirit", label: "Reflection", href: "/reflection", icon: Flower2, group: "life", phase: 3,
    summary: "Journaling, gratitude, prayer or meditation routines: private by default.",
    capabilities: ["Daily journal and gratitude entries", "Prayer, meditation or other practices you define", "Values and intentions", "Private by default; never sent to AI without your opt-in"] },
  { key: "relationships", label: "Relationships", href: "/relationships", icon: Users, group: "life", phase: 3,
    summary: "People who matter, important dates and planned quality time.",
    capabilities: ["Birthdays and anniversaries with reminders", "Keep-in-touch cadence", "Planned quality time", "Private notes"] },
  { key: "admin", label: "Home & Admin", href: "/admin", icon: House, group: "life", phase: 3,
    summary: "Household tasks, renewals, documents and life admin.",
    capabilities: ["Household routines and chores", "Renewals and expiry dates", "Important documents and records", "Links to Finance bills"] },
  { key: "wheel", label: "Wheel of Life", href: "/wheel", icon: Orbit, group: "reflect", phase: 3,
    summary: "Subjective 1–10 ratings across life areas, compared over time.",
    capabilities: ["Customisable categories", "Current and desired ratings", "Quarterly reassessment and history", "Improvement goals linked to categories"] },
  { key: "reports", label: "Reports", href: "/reports", icon: BarChart3, group: "reflect", phase: 5,
    summary: "Daily to annual reports that separate measurements from interpretation.",
    capabilities: ["Daily, weekly, monthly, quarterly, annual", "Measured results kept apart from AI interpretation", "Printable and exportable", "No charts where there is no data"] },
  { key: "knowledge", label: "Knowledge Base", href: "/knowledge", icon: BookOpen, group: "reflect", phase: 3,
    summary: "Notes, ideas, decisions and references, searchable and linked to your work.",
    capabilities: ["Notes, ideas, meeting and decision records", "Full-text search, tags and folders", "Backlinks to goals, tasks and projects", "Secure file attachments"] },
  { key: "integrations", label: "Integrations", href: "/integrations", icon: Plug, group: "system", phase: 7,
    summary: "Connect calendars, health platforms and more, with clear permissions.",
    capabilities: ["Google and Outlook calendars (OAuth, least privilege)", "Push and email notifications", "Health platform imports where supported", "Last sync, errors and granted permissions per connection"] },
  { key: "settings", label: "Settings", href: "/settings", icon: Settings, group: "system", phase: 1, required: true,
    summary: "Preferences, module visibility, privacy, security and your data.",
    capabilities: [] },
];

export const MODULE_GROUP_LABELS: Record<ModuleGroup, string> = {
  overview: "Overview",
  plan: "Plan",
  life: "Life areas",
  reflect: "Reflect",
  system: "System",
};

export function getModule(key: string): ModuleDef {
  const m = MODULES.find((mod) => mod.key === key);
  if (!m) throw new Error(`Unknown module: ${key}`);
  return m;
}

/** Modules with phase <= this are built; later ones show a placeholder. */
export const BUILT_THROUGH_PHASE = 8;
