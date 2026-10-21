"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { claimDueReminders, completeReminder, snoozeReminder } from "@/server/actions/reminders";

const POLL_MS = 60_000;

/**
 * In-app reminders only: while a Life OS tab is open, check once a minute
 * for reminders that are due and show them as toasts. Nothing fires when
 * the app is closed; push and email delivery arrive in phase 7.
 *
 * claimDueReminders records an in_app delivery per reminder occurrence, so
 * two open tabs don't both show the same reminder.
 */
export function ReminderNotifier() {
  const busy = useRef(false);

  useEffect(() => {
    async function check() {
      if (busy.current || document.visibilityState !== "visible") return;
      busy.current = true;
      try {
        const r = await claimDueReminders();
        if (!r.ok || !r.data) return;
        for (const rem of r.data) {
          toast(rem.title, {
            id: `reminder-${rem.id}-${rem.at}`,
            description: "Reminder",
            duration: Infinity,
            action: { label: "Done", onClick: () => void completeReminder(rem.id) },
            cancel: { label: "Snooze 10 min", onClick: () => void snoozeReminder(rem.id, 10) },
          });
        }
      } catch {
        // Offline or signed out: try again on the next tick.
      } finally {
        busy.current = false;
      }
    }

    void check();
    const timer = setInterval(check, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
