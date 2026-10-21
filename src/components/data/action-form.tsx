"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useServerAction } from "@/features/dashboard/use-server-action";
import type { ActionResult } from "@/server/actions/result";

type Errors = Record<string, string[] | undefined>;

/** Form state plus submit plumbing: field errors from the server land next to their inputs. */
export function useActionForm<T extends object>(initial: () => T) {
  const [v, setV] = useState<T>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const { pending, run } = useServerAction();
  const set = <K extends keyof T>(k: K, val: T[K]) => setV((s) => ({ ...s, [k]: val }));
  const err = (k: string) => errors[k]?.[0];
  const submit = <R,>(fn: (v: T) => Promise<ActionResult<R>>, onDone: (r: Extract<ActionResult<R>, { ok: true }>) => void) => (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    run(async () => {
      const r = await fn(v);
      if (!r.ok && r.fieldErrors) setErrors(r.fieldErrors);
      return r;
    }, { onSuccess: onDone });
  };
  return { v, set, setV, err, pending, submit };
}

export function FormActions({ pending, label, onCancel }: { pending: boolean; label: string; onCancel: () => void }) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : label}</Button>
    </div>
  );
}
