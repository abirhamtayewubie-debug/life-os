import Link from "next/link";
import { AuthForm } from "@/components/shell/auth-form";
import { Button } from "@/components/ui/button";
import { isDemoMode } from "@/lib/supabase/env";
import { signIn } from "@/server/actions/auth";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (isDemoMode()) return <DemoNotice />;
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  const notice = sp.error === "confirmation" ? "That link couldn't sign you in, but your email may be confirmed already: try signing in. If it asks you to confirm first, the link had expired; sign up again with the same email to get a new one."
    : sp.deleted === "1" ? "Your account and everything in it were deleted." : undefined;
  return <AuthForm mode="login" action={signIn} next={next} notice={notice} />;
}

function DemoNotice() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Demo mode</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        No database is connected yet, so there are no accounts. Add your Supabase URL and publishable key to <code className="font-mono text-xs">.env.local</code> to enable sign-in.
      </p>
      <Button className="mt-6" asChild><Link href="/">Explore with sample data</Link></Button>
    </div>
  );
}
