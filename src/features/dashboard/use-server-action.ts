"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/server/actions/result";

/** Runs a server action with consistent success / error / demo feedback. */
export function useServerAction() {
  const [pending, start] = useTransition();
  function run<T>(fn: () => Promise<ActionResult<T>>, opts: { onError?: () => void; onSuccess?: (r: Extract<ActionResult<T>, { ok: true }>) => void; quiet?: boolean } = {}) {
    start(async () => {
      try {
        const r = await fn();
        if (r.ok) {
          if (r.message && !opts.quiet) toast.success(r.message);
          opts.onSuccess?.(r);
        } else {
          opts.onError?.();
          if (r.demo) toast(r.error, { description: "Try it after connecting a database." });
          else toast.error(r.error);
        }
      } catch {
        opts.onError?.();
        toast.error("Something went wrong. Please try again.");
      }
    });
  }
  return { pending, run };
}
