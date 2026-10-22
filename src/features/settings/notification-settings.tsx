"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BellOff, BellRing, Send, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useServerAction } from "@/features/dashboard/use-server-action";
import { removePushSubscription, savePushSubscription, sendTestNotification } from "@/server/actions/notifications";

export type DeviceRow = { id: string; label: string | null; createdAt: string; lastSuccessAt: string | null; endpoint: string };

type Support = "checking" | "unsupported" | "ios-install" | "ok";

function urlBase64ToBytes(s: string) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function NotificationSettings({ devices, configured, publicKey, locale }: { devices: DeviceRow[]; configured: boolean; publicKey: string | null; locale: string }) {
  const router = useRouter();
  const { pending, run } = useServerAction();
  const [support, setSupport] = useState<Support>("checking");
  const [permission, setPermission] = useState<NotificationPermission | "unknown">("unknown");
  const [thisEndpoint, setThisEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    const ios = /iPhone|iPad/.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser capabilities once on mount
    setSupport(!ok ? (ios && !standalone ? "ios-install" : "unsupported") : "ok");
    if (!ok) return;
    setPermission(Notification.permission);
    navigator.serviceWorker.getRegistration("/").then((reg) => reg?.pushManager.getSubscription()).then((sub) => setThisEndpoint(sub?.endpoint ?? null)).catch(() => {});
  }, []);

  const thisDeviceOn = !!thisEndpoint && devices.some((d) => d.endpoint === thisEndpoint);

  async function turnOn() {
    if (!publicKey) return;
    setBusy(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") return;
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(publicKey) }));
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      run(() => savePushSubscription({ endpoint: json.endpoint, keys: json.keys }), {
        onSuccess: () => { setThisEndpoint(json.endpoint); router.refresh(); },
      });
    } catch {
      setPermission(Notification.permission);
    } finally {
      setBusy(false);
    }
  }

  async function turnOffHere(id: string) {
    const reg = await navigator.serviceWorker.getRegistration("/");
    await (await reg?.pushManager.getSubscription())?.unsubscribe().catch(() => {});
    setThisEndpoint(null);
    run(() => removePushSubscription(id), { onSuccess: () => router.refresh() });
  }

  const fmt = (iso: string) => new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="grid gap-4">
      {!configured ? (
        <p className="rounded-md border border-dashed border-border p-3 text-[12px] text-muted-foreground">
          The server has no notification keys yet (VAPID), so devices can&apos;t be turned on. Reminders still appear in the app while it&apos;s open.
        </p>
      ) : support === "unsupported" ? (
        <p className="text-sm text-muted-foreground">This browser can&apos;t receive notifications from websites.</p>
      ) : support === "ios-install" ? (
        <p className="text-sm text-muted-foreground">On iPhone and iPad, add Life OS to your Home Screen first (Share → Add to Home Screen), then open it from there and turn notifications on.</p>
      ) : permission === "denied" ? (
        <p className="text-sm text-muted-foreground">Notifications are blocked for this site in your browser settings. Allow them there, then come back.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {thisDeviceOn ? (
            <p className="flex items-center gap-1.5 text-sm"><BellRing className="size-4 text-success" aria-hidden /> On for this device.</p>
          ) : (
            <Button onClick={turnOn} disabled={busy || pending || support !== "ok"}><BellRing /> {busy ? "Asking your browser…" : "Turn on for this device"}</Button>
          )}
          {devices.length > 0 && (
            <Button variant="outline" disabled={pending} onClick={() => run(() => sendTestNotification(), { onSuccess: () => router.refresh() })}><Send /> Send a test</Button>
          )}
        </div>
      )}

      {devices.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border" aria-label="Devices with notifications on">
          {devices.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
              <Smartphone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-[13px]">{d.label ?? "Browser"}{d.endpoint === thisEndpoint && <span className="text-muted-foreground"> · this device</span>}</p>
                <p className="text-xs text-muted-foreground">Added {fmt(d.createdAt)}{d.lastSuccessAt ? ` · last delivered ${fmt(d.lastSuccessAt)}` : " · nothing delivered yet"}</p>
              </div>
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => (d.endpoint === thisEndpoint ? turnOffHere(d.id) : run(() => removePushSubscription(d.id), { onSuccess: () => router.refresh() }))}>
                <BellOff /> Turn off
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground">
        Notifications go through your browser maker&apos;s push service (Google, Apple, Mozilla or Microsoft). The text is encrypted for your device, so they carry it without being able to read it. Choose per reminder whether it should notify your devices.
      </p>
    </div>
  );
}
