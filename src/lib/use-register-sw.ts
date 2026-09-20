import { useEffect } from "react";

/**
 * Registers the service worker, once, on every load.
 *
 * This is separate from asking for notification permission or creating a
 * push subscription — those only happen when someone deliberately turns a
 * preference on (see the notification preferences in Profile). Registering
 * the worker itself is harmless and needed unconditionally: it's also what
 * makes the app installable at all, which is the whole point on iOS/iPadOS,
 * where Safari refuses web push to anything that isn't added to the Home
 * Screen.
 *
 * Silently does nothing where service workers aren't supported, rather than
 * throwing — this runs on every page load, including in browsers that will
 * never see a notification.
 */
export function useRegisterServiceWorker() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // A failed registration here means no push and no install prompt —
      // real costs, but not ones that should ever surface as an error the
      // person sees. The rest of the app works identically either way.
    });
  }, []);
}
