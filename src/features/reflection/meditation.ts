/**
 * Meditation helpers: reading a YouTube link, and practice summaries.
 * Practice totals reuse the study-time helpers, so the maths lives in one place.
 */
import { minutesBetween, minutesByWeek, studyStreak } from "@/features/learning/plan";
import type { MeditationSession } from "./types";

const ID = /^[A-Za-z0-9_-]{11}$/;

/** The video id of a YouTube link (watch, youtu.be, shorts, embed, live), or null for anything else. */
export function youtubeId(url: string): string | null {
  let u: URL;
  try { u = new URL(url.trim()); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^(www\.|m\.|music\.)/, "");
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else {
      const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/);
      id = m ? m[1] : null;
    }
  }
  return id && ID.test(id) ? id : null;
}

/** Privacy-enhanced player: YouTube sets no cookies until the video is played. */
export const embedUrl = (id: string) => `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`;
export const thumbnailUrl = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

const asStudy = (s: Pick<MeditationSession, "practiced_on" | "minutes">[]) => s.map((x) => ({ studied_on: x.practiced_on, minutes: x.minutes }));

export const practiceMinutes = (s: Pick<MeditationSession, "practiced_on" | "minutes">[], from: string, to: string) => minutesBetween(asStudy(s), from, to);
export const practiceByWeek = (s: Pick<MeditationSession, "practiced_on" | "minutes">[], today: string, weeks = 8) => minutesByWeek(asStudy(s), today, weeks);
export const practiceStreak = (s: Pick<MeditationSession, "practiced_on" | "minutes">[], today: string) => studyStreak(asStudy(s), today);
