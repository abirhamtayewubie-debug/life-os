/* Life OS service worker: shows reminder notifications and opens the app
   when one is tapped. It doesn't cache pages or data. */

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: event.data ? event.data.text() : "Life OS" }; }
  const title = typeof data.title === "string" && data.title ? data.title.slice(0, 120) : "Life OS";
  event.waitUntil(self.registration.showNotification(title, {
    body: typeof data.body === "string" ? data.body.slice(0, 240) : "",
    tag: typeof data.tag === "string" ? data.tag : undefined,
    icon: "/icons/icon-192.png",
    data: { url: typeof data.url === "string" && data.url.startsWith("/") && !data.url.startsWith("//") ? data.url : "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const tab of tabs) {
      if (new URL(tab.url).origin === self.location.origin && "focus" in tab) {
        await tab.focus();
        if ("navigate" in tab) await tab.navigate(url);
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
