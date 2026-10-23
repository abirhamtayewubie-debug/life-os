"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/data/empty-state";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="rounded-3xl bg-card shadow-card">
      <EmptyState icon={TriangleAlert} title="This page couldn't load" action={<Button onClick={reset}>Try again</Button>}>
        Your data is safe. The problem has been logged{error.digest ? ` (reference ${error.digest})` : ""}.
      </EmptyState>
    </div>
  );
}
