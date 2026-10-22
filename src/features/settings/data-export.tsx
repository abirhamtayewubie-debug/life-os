"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileJson, FolderArchive, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useActionForm } from "@/components/data/action-form";
import { DELETE_PHRASE } from "@/features/account/constants";
import { EXPORT_GROUPS } from "@/features/export/tables";
import { deleteAccount } from "@/server/actions/account";

const href = (q: string) => `/settings/export?${q}`;

export function DataExport() {
  const [table, setTable] = useState(EXPORT_GROUPS[1].tables[0]);
  return (
    <div className="grid gap-4">
      <div>
        <h3 className="text-[13px] font-medium">Download everything</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">Every record you own, as stored, including sample rows (marked in the source column). Integration secrets are never included.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="outline" asChild><a href={href("format=json")} download><FileJson /> All data (JSON)</a></Button>
          <Button variant="outline" asChild><a href={href("format=zip")} download><FolderArchive /> All tables (CSV, zipped)</a></Button>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Field id="export-table" label="One table as CSV">
          <NativeSelect id="export-table" value={table} onChange={(e) => setTable(e.target.value)}>
            {EXPORT_GROUPS.map((g) => (
              <optgroup key={g.key} label={g.label}>
                {g.tables.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </optgroup>
            ))}
          </NativeSelect>
        </Field>
        <Button variant="outline" asChild><a href={href(`format=csv&table=${table}`)} download><Download /> Download CSV</a></Button>
      </div>
    </div>
  );
}

export function DeleteAccount() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { v, set, err, pending, submit } = useActionForm(() => ({ password: "", phrase: "" }));
  const ready = v.password.length > 0 && v.phrase.trim().toLowerCase() === DELETE_PHRASE;

  return (
    <div className="rounded-md border border-destructive/40 p-3">
      <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-destructive"><TriangleAlert className="size-3.5" aria-hidden /> Delete your account</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">Removes your sign-in and every record in every module, immediately and for good. Download your data first if you want a copy.</p>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button variant="destructive" className="mt-3">Delete account…</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>Everything goes: tasks, calendar, money, health, journal, notes, the assistant&apos;s history, and your sign-in. This can&apos;t be undone.</DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={submit(deleteAccount, () => router.replace("/login?deleted=1"))}>
            <Field id="delete-password" label="Your password" error={err("password")}>
              <Input id="delete-password" type="password" autoComplete="current-password" value={v.password} onChange={(e) => set("password", e.target.value)} aria-invalid={!!err("password")} />
            </Field>
            <Field id="delete-phrase" label={<>Type <span className="font-mono">{DELETE_PHRASE}</span> to confirm</>} error={err("phrase")}>
              <Input id="delete-phrase" autoComplete="off" value={v.phrase} onChange={(e) => set("phrase", e.target.value)} aria-invalid={!!err("phrase")} />
            </Field>
            <DialogFooter>
              <DialogClose asChild><Button type="button" variant="outline">Keep my account</Button></DialogClose>
              <Button type="submit" variant="destructive" disabled={!ready || pending}>{pending ? "Deleting…" : "Delete everything"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
