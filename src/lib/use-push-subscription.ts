import { useEffect } from "react";

import { actions } from "@/lib/store";
import type { Settings } from "@/lib/store-types";

/**
 * The push service hands the application server key back as base64url; the
 * Web Push API wants it as a raw byte array.
 *
 * Built with `new Uint8Array(length)` rather than `Uint8Array.from(...)`,
 * which matters for a reason that has nothing to do with the bytes
 * themselves: newer TypeScript infers `Uint8Array.from`'s result as backed
 * by `ArrayBufferLike`, a union that includes `SharedArrayBuffer` — and
 * `PushSubscriptionOptionsInit.applicationServerKey` wants `BufferSource`,
 * which requires a concrete `ArrayBuffer`. A plain allocation is
 * unambiguously one, so it satisfies the stricter type without a cast.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * Keeps a live push subscription registered for this browser whenever any
 * notification preference is on.
 *
 * The preferences are the actual gate on what gets sent — this only makes
 * sure a subscription *exists* for a later scheduled sender to find.
 * Deliberately one-directional: turning every preference back off leaves the
 * subscription in place rather than tearing it down, so flipping a switch
 * twice in a row does not mean unsubscribing and resubscribing the browser
 * each time. A stale, unused subscription costs nothing — nothing is ever
 * sent to it while every preference is off.
 */
export function usePushSubscription(
  settings: Settings,
  loaded: boolean,
  userId: string | undefined,
) {
  const wantsAny = settings.notifyTimer || settings.notifyTaskDue || settings.notifyMorning;

  useEffect(() => {
    if (!loaded || !wantsAny || !userId) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    let cancelled = false;

    void (async () => {
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
        if (!publicKey) return;
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      if (cancelled) return;

      const json = subscription.toJSON();
      actions.savePushSubscription({
        endpoint: subscription.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
        userAgent: navigator.userAgent,
      });
    })().catch(() => {
      // A failed subscribe means no push for this device until the next
      // mount — the rest of the app works identically without it, so this
      // stays quiet rather than surfacing an error for infrastructure
      // nobody asked to see.
    });

    return () => {
      cancelled = true;
    };
  }, [
    loaded,
    wantsAny,
    userId,
    settings.notifyTimer,
    settings.notifyTaskDue,
    settings.notifyMorning,
  ]);
}
