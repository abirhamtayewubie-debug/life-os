import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getViewer } from "../viewer";

/**
 * Every mutation re-establishes who the caller is (never trusting client
 * input for identity) and returns a user-scoped client, so RLS applies.
 */
export async function liveContext() {
  const viewer = await getViewer();
  if (viewer.mode === "demo") return null;
  const supabase = await createSupabaseServerClient();
  return { viewer, supabase };
}

export async function audit(
  ctx: NonNullable<Awaited<ReturnType<typeof liveContext>>>,
  action: string,
  entity?: { type: string; id?: string },
  metadata: Record<string, unknown> = {},
) {
  await ctx.supabase.from("audit_events").insert({
    user_id: ctx.viewer.userId,
    action,
    entity_type: entity?.type ?? null,
    entity_id: entity?.id ?? null,
    metadata,
  });
}
