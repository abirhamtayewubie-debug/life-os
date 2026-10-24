import { NextResponse } from "next/server";
import { liveContext } from "@/server/actions/guard";
import { isUuid } from "@/server/actions/validation";

/**
 * Opens an uploaded book file: looks the item up through your session (RLS),
 * then sends you to a signed link that works for five minutes. Files are
 * never public; `?download=1` saves instead of opening.
 */
export async function GET(req: Request, { params }: RouteContext<"/learning/files/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  const ctx = await liveContext();
  if (!ctx) return new Response("Demo mode has no uploaded files. Connect your account to upload your own.", { status: 404 });
  const { data: item } = await ctx.supabase.from("learning_items").select("file_path, file_name").eq("id", id).maybeSingle();
  if (!item?.file_path) return new Response("Not found", { status: 404 });
  const download = new URL(req.url).searchParams.get("download") === "1";
  const { data, error } = await ctx.supabase.storage.from("reading").createSignedUrl(item.file_path, 300, download ? { download: item.file_name ?? true } : undefined);
  if (error || !data) return new Response("Couldn't open the file.", { status: 502 });
  return NextResponse.redirect(data.signedUrl, { status: 303, headers: { "Cache-Control": "private, no-store" } });
}
