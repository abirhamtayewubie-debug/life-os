export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; demo?: boolean; fieldErrors?: Record<string, string[]> };

export const DEMO_RESULT = {
  ok: false as const,
  demo: true,
  error: "Demo mode: changes aren't saved. Connect Supabase to keep your data.",
};
