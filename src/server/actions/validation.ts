import { z } from "zod";
import type { ActionResult } from "./result";

/** Shared zod pieces for Server Actions (this file is not itself a server action module). */
export const uuid = z.uuid();
export const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date").refine((s) => !Number.isNaN(Date.parse(s)), "Use a valid date");
export const optionalDate = dateKey.optional().or(z.literal("")).transform((v) => v || null);
export const optionalUuid = uuid.optional().or(z.literal("")).transform((v) => v || null);
export const optionalText = (max: number) => z.string().trim().max(max).optional().default("").transform((v) => v || null);
export const optionalUrl = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .default("")
  .refine((v) => !v || /^https?:\/\//i.test(v), "Use a link starting with http:// or https://")
  .transform((v) => v || null);

export function invalid(error: z.ZodError): Extract<ActionResult<never>, { ok: false }> {
  return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[]> };
}

export const isUuid = (v: unknown): v is string => uuid.safeParse(v).success;
