import { redirect } from "next/navigation";
import { AuthForm } from "@/components/shell/auth-form";
import { isDemoMode } from "@/lib/supabase/env";
import { signUp } from "@/server/actions/auth";

export const metadata = { title: "Create account" };

export default function SignupPage() {
  if (isDemoMode()) redirect("/login");
  return <AuthForm mode="signup" action={signUp} />;
}
