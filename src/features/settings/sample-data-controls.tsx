"use client";

import { useRouter } from "next/navigation";
import { FlaskConical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { loadSampleData, purgeSampleData } from "@/server/actions/settings";
import { useServerAction } from "@/features/dashboard/use-server-action";

export function SampleDataControls({ hasSample, demo }: { hasSample: boolean; demo: boolean }) {
  const router = useRouter();
  const { pending, run } = useServerAction();
  if (demo) {
    return <p className="text-sm text-muted-foreground">You&apos;re in demo mode, so everything shown is sample data generated on the fly and nothing is stored.</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" disabled={pending || hasSample} onClick={() => run(() => loadSampleData(), { onSuccess: () => router.refresh() })}>
        <FlaskConical /> {hasSample ? "Sample data loaded" : pending ? "Loading…" : "Load sample data"}
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" disabled={pending || !hasSample}><Trash2 /> Remove sample data</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogTitle>Remove all sample data?</AlertDialogTitle>
          <AlertDialogDescription>
            This deletes every record marked “Sample” from your account. Records you created yourself are not touched. This can&apos;t be undone, but you can load sample data again later.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => run(() => purgeSampleData(), { onSuccess: () => router.refresh() })}>Remove sample data</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
