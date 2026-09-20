import { useCallback, useEffect, useState } from "react";

export type NotifyPermission = "unsupported" | "default" | "granted" | "denied";

/**
 * A notification for when a focus block ends — local, not push.
 *
 * No VAPID key, no subscription, no server round trip. This is the
 * Notification API shown through the service worker already registered by
 * useRegisterServiceWorker, fired directly from the page at the instant the
 * timer reaches zero. Push (docs/PUSH_NOTIFICATIONS_PLAN.md) is for the case
 * where the tab is not open at all; this covers the far more common one —
 * a block finishing while the tab is merely backgrounded — which is exactly
 * the case the timer's own chime already documents as silently failing
 * (browsers refuse to open an AudioContext without a fresh user gesture, and
 * "the tab was backgrounded" is precisely that).
 *
 * Starts at "unsupported" on every render, client and server alike, and
 * corrects itself in an effect once mounted. Reading `Notification.permission`
 * directly in render would make the very first paint depend on something the
 * server cannot know and the client only knows a tick later — the same
 * flash-then-correct shape as the theme and calendar bugs elsewhere in this
 * app. Starting closed and opening once is the fix each time.
 */
export function useFocusNotify() {
  const [permission, setPermission] = useState<NotifyPermission>("unsupported");

  useEffect(() => {
    if (typeof Notification === "undefined") return;
    setPermission(Notification.permission as NotifyPermission);
  }, []);

  const request = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setPermission(result as NotifyPermission);
  }, []);

  /**
   * Shown through the service worker registration rather than
   * `new Notification(...)` directly — the direct constructor throws once a
   * service worker controls the page on some mobile browsers, where
   * `registration.showNotification` is the form that actually works
   * everywhere this needs to.
   *
   * No badge is ever set, matching sw.js and the product's own rule against
   * anything that accumulates into a tally on the home screen icon.
   */
  const notify = useCallback(async (title: string, body: string) => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (!("serviceWorker" in navigator)) return;
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, {
        body,
        icon: "/icon-192.png",
        tag: "focus-timer",
      });
    } catch {
      // Same posture as the chime it stands in for: a missed notification
      // here costs nothing else in the app, so this fails quietly rather
      // than surfacing an error for something this small.
    }
  }, []);

  return { permission, request, notify };
}
