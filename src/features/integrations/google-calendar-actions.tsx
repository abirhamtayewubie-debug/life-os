"use client";

import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useServerAction } from "@/features/dashboard/use-server-action";
import { disconnectGoogle, syncGoogleNow } from "@/server/actions/google";

type Props = { status: "connected" | "error" | "revoked" | "disconnected" | null };

/** Connect, sync and disconnect buttons for the Google Calendar card. */
export function GoogleCalendarActions({ status }: Props) {
  const router = useRouter();
  const { pending, run } = useServerAction();
  const linked = status === "connected" || status === "error";
  return (
    <>
      {/* A full page visit, not client navigation: it leaves for Google's sign-in. */}
      {status !== "connected" && (
        <Button size="sm" asChild>
          <a href="/api/google/connect">{status === "error" ? "Reconnect" : "Connect Google Calendar"}</a>
        </Button>
      )}
      {status === "connected" && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => syncGoogleNow(), { onSuccess: () => router.refresh(), onError: () => router.refresh() })}>
          <RefreshCw className={pending ? "animate-spin" : undefined} aria-hidden /> {pending ? "Syncing…" : "Sync now"}
        </Button>
      )}
      {linked && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="ghost" disabled={pending}>Disconnect</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>Disconnect Google Calendar?</AlertDialogTitle>
            <AlertDialogDescription>
              Events that came from Google are removed from Life OS (they stay in Google). Events you made in Life OS stay here, and the copies already in Google stay there.
            </AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep syncing</AlertDialogCancel>
              <AlertDialogAction onClick={() => run(() => disconnectGoogle(), { onSuccess: () => router.refresh() })}>Disconnect</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
