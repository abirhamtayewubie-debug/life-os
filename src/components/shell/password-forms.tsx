"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset, setNewPassword } from "@/server/actions/auth";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, null);
  const fe = state && !state.ok ? state.fieldErrors ?? {} : {};
  return (
    <div>
      <h1 className="font-display text-[32px] leading-tight font-semibold tracking-[-0.028em]">Reset your password</h1>
      <p className="mt-1 text-sm text-muted-foreground">Enter your account email and we&apos;ll send you a link to choose a new password.</p>
      <form action={formAction} className="mt-6 grid gap-4" noValidate>
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={!!fe.email} aria-describedby={fe.email ? "email-err" : undefined} />
          {fe.email && <p id="email-err" className="text-xs text-destructive">{fe.email[0]}</p>}
        </div>
        {state && (
          <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-sm text-success" : "text-sm text-destructive"}>
            {state.ok ? state.message : state.error}
          </p>
        )}
        <Button type="submit" size="lg" disabled={pending}>{pending ? "Please wait…" : "Send reset link"}</Button>
      </form>
      <p className="mt-6 text-sm text-muted-foreground">
        Remembered it? <Link className="font-medium text-foreground underline-offset-4 hover:underline" href="/login">Sign in</Link>
      </p>
    </div>
  );
}

export function NewPasswordForm() {
  const [state, formAction, pending] = useActionState(setNewPassword, null);
  const fe = state && !state.ok ? state.fieldErrors ?? {} : {};
  return (
    <div>
      <h1 className="font-display text-[32px] leading-tight font-semibold tracking-[-0.028em]">Choose a new password</h1>
      <p className="mt-1 text-sm text-muted-foreground">You&apos;ll stay signed in on this device with the new password.</p>
      <form action={formAction} className="mt-6 grid gap-4" noValidate>
        <div className="grid gap-1.5">
          <Label htmlFor="password">New password</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} aria-invalid={!!fe.password} aria-describedby="pw-hint" />
          <p id="pw-hint" className={fe.password ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
            {fe.password?.[0] ?? "At least 10 characters. A passphrase works well."}
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="confirm">Type it again</Label>
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required aria-invalid={!!fe.confirm} aria-describedby={fe.confirm ? "confirm-err" : undefined} />
          {fe.confirm && <p id="confirm-err" className="text-xs text-destructive">{fe.confirm[0]}</p>}
        </div>
        {state && !state.ok && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
        <Button type="submit" size="lg" disabled={pending}>{pending ? "Please wait…" : "Save new password"}</Button>
      </form>
    </div>
  );
}
