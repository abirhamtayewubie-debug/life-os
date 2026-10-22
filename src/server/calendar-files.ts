import "server-only";
import { headers } from "next/headers";
import type { IcsEventOut } from "@/lib/ics";

export type IcsRow = {
  id: string; title: string; description: string | null; location: string | null; all_day: boolean;
  starts_at: string; ends_at: string; timezone: string; recurrence_rule: string | null; updated_at: string | null;
};

export const ICS_COLUMNS = "id, title, description, location, all_day, starts_at, ends_at, timezone, recurrence_rule, updated_at";

export const toIcsEvents = (rows: IcsRow[]): IcsEventOut[] =>
  rows.map((r) => ({ id: r.id, title: r.title, description: r.description, location: r.location, allDay: r.all_day, startsAt: r.starts_at, endsAt: r.ends_at, timezone: r.timezone, recurrenceRule: r.recurrence_rule, updatedAt: r.updated_at }));

/** The site's own origin, for links a calendar app will call later. */
export async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured && process.env.NODE_ENV === "production" && !configured.includes("localhost")) return configured.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return (configured ?? "").replace(/\/$/, "");
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}
