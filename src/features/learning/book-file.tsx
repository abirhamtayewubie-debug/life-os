"use client";

import { useRef } from "react";
import { FileText, Loader2, Upload } from "lucide-react";
import { ConfirmDelete } from "@/components/data/confirm-delete";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { attachBookFile, prepareBookUpload, removeBookFile } from "@/server/actions/learning";
import { DEMO_RESULT } from "@/server/actions/result";
import { useServerAction } from "@/features/dashboard/use-server-action";
import { BOOK_FILE_TYPES, type LearningItem } from "./types";

const ACCEPT = [...BOOK_FILE_TYPES, ".epub", ".md"].join(",");

export function fileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** Browsers often report EPUB and Markdown as unknown types; name them from the extension. */
function typeOf(f: File): string {
  if (f.type && f.type !== "application/octet-stream") return f.type;
  const ext = f.name.split(".").pop()?.toLowerCase();
  return ext === "epub" ? "application/epub+zip" : ext === "md" ? "text/markdown" : ext === "txt" ? "text/plain" : f.type;
}

/**
 * The book's uploaded file: open it (a short-lived private link), replace it
 * or remove it. Uploads go from the browser straight to private storage with
 * a one-time link, so the file never passes through the app server.
 */
export function BookFile({ item, demo, compact = false }: { item: LearningItem; demo: boolean; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const { pending, run } = useServerAction();

  const upload = (f: File) => run(async () => {
    const meta = { name: f.name, size: f.size, type: typeOf(f) };
    const prep = await prepareBookUpload(item.id, meta);
    if (!prep.ok || !prep.data) return prep.ok ? { ok: false as const, error: "Couldn't start the upload." } : prep;
    const { error } = await createSupabaseBrowserClient().storage.from("reading").uploadToSignedUrl(prep.data.path, prep.data.token, f, { contentType: meta.type });
    if (error) return { ok: false as const, error: "The upload didn't finish. Check your connection and try again." };
    return attachBookFile(item.id, prep.data.path, meta);
  });

  const picker = (
    <input ref={input} type="file" accept={ACCEPT} className="hidden" aria-hidden tabIndex={-1}
      onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
  );

  if (!item.file_name) {
    return (
      <>
        {picker}
        <Button type="button" size="sm" variant="outline" disabled={pending} title={demo ? "Uploads need your own account" : undefined}
          onClick={() => (demo ? run(async () => DEMO_RESULT) : input.current?.click())}>
          {pending ? <><Loader2 className="animate-spin" /> Uploading…</> : <><Upload /> {compact ? "File" : "Upload a file"}</>}
        </Button>
      </>
    );
  }

  return (
    <div className={cn("flex min-w-0 items-center gap-1 rounded-lg border border-border py-0.5 pr-0.5 pl-2 text-[12px]", compact && "max-w-56")}>
      {picker}
      <FileText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <a href={demo ? undefined : `/learning/files/${item.id}`} target="_blank" rel="noopener noreferrer" aria-disabled={demo}
        className={cn("min-w-0 truncate hover:underline", demo && "pointer-events-none")} title={item.file_name}>
        {item.file_name}
      </a>
      {item.file_size && !compact && <span className="shrink-0 text-muted-foreground">{fileSize(item.file_size)}</span>}
      {pending ? <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-label="Working" /> : (
        <>
          {!compact && <Button type="button" size="sm" variant="ghost" className="h-6 px-1.5 text-[12px]" disabled={demo} onClick={() => input.current?.click()}>Replace</Button>}
          <ConfirmDelete size="icon-sm" label={`Remove ${item.file_name}`} title="Remove this file?" description="The uploaded file is deleted. The book and your reading log stay." confirmLabel="Remove" disabled={pending || demo} onConfirm={() => run(() => removeBookFile(item.id))} />
        </>
      )}
    </div>
  );
}
