"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/server/actions/result";

type Mode = "login" | "signup";

export function AuthForm({ mode, action, next, notice }: { mode: Mode; action: (prev: ActionResult | null, f: FormData) => Promise<ActionResult>; next?: string; notice?: string }) {
  const [state, formAction, pending] = useActionState(action, null);
  const fe = state && !state.ok ? state.fieldErrors ?? {} : {};
  return (
    <div>
      <h1 className="font-display text-[32px] leading-tight font-semibold tracking-[-0.028em]">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{mode === "login" ? "Sign in to your Life OS." : "One account, all of your life areas, private by default."}</p>
      {notice && <p className="mt-4 rounded-xl border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">{notice}</p>}
      <form action={formAction} className="mt-6 grid gap-4" noValidate>
        {next && <input type="hidden" name="next" value={next} />}
        {mode === "signup" && (
          <div className="grid gap-1.5">
            <Label htmlFor="displayName">Name <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id="displayName" name="displayName" autoComplete="given-name" maxLength={80} />
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={!!fe.email} aria-describedby={fe.email ? "email-err" : undefined} />
          {fe.email && <p id="email-err" className="text-xs text-destructive">{fe.email[0]}</p>}
        </div>
        <div className="grid gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="password">Password</Label>
            {mode === "login" && <Link className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" href="/forgot-password">Forgot password?</Link>}
          </div>
          <Input id="password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={10} aria-invalid={!!fe.password} aria-describedby="pw-hint" />
          <p id="pw-hint" className={fe.password ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
            {fe.password?.[0] ?? (mode === "signup" ? "At least 10 characters. A passphrase works well." : "")}
          </p>
        </div>
        {state && (
          <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-sm text-success" : "text-sm text-destructive"}>
            {state.ok ? state.message : state.error}
          </p>
        )}
        <Button type="submit" size="lg" disabled={pending}>{pending ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</Button>
      </form>
      <p className="mt-6 text-sm text-muted-foreground">
        {mode === "login" ? <>New here? <Link className="font-medium text-foreground underline-offset-4 hover:underline" href="/signup">Create an account</Link></>
          : <>Already have an account? <Link className="font-medium text-foreground underline-offset-4 hover:underline" href="/login">Sign in</Link></>}
      </p>
    </div>
  );
}
