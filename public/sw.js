/**
 * Deliberately dumb.
 *
 * This app is server-rendered through TanStack Start, and a service worker
 * that precaches or intercepts navigation would start serving stale HTML
 * back to people — a worse bug than having no offline mode at all. So this
 * one does exactly two things and nothing else: show a push notification,
 * and take you somewhere sensible when it's tapped. No `fetch` handler, no
 * cache, no install-time asset list.
 */

self.addEventListener("install", () => {
  // Take over immediately rather than waiting for every open tab to close —
  // there is no previous version of this worker's cache to protect.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  /*
   * The payload is JSON: { title, body, url, tag }.
   *
   * `tag` collapses a repeat of the same notification (say, a retried send)
   * into one, rather than stacking duplicates on the lock screen — which is
   * exactly the kind of noise the product's no-shaming, nothing-scored
   * premise rules out elsewhere.
   */
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "grounded", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "grounded";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag,
    data: { url: data.url || "/" },
    // No badge count is ever set here, and none is set anywhere else in this
    // app on purpose — see docs/barktank/01-introduction.md. A number
    // sitting on the home screen icon is a tally, and a tally is a streak
    // with a different shape.
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        // Focus an already-open tab rather than opening a second one, and
        // navigate it — a tap on "assignment due tonight" should land on
        // that assignment, not on whichever page the tab happened to be on.
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(targetUrl);
          return;
        }
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});
