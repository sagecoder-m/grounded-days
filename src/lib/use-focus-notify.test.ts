import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { useFocusNotify } from "./use-focus-notify";

/**
 * The behaviour this guards is the same shape of bug as use-theme.test.ts:
 * a hook must not trust a real-seeming default for something it cannot know
 * until the client has actually mounted. Here that default would be reading
 * `Notification.permission` straight into the initial render, which — on the
 * server, where `Notification` does not exist at all — would need a branch
 * of its own and risks a hydration mismatch the moment it disagrees with
 * whatever the client corrects it to a tick later. Starting at "unsupported"
 * unconditionally and correcting once, in an effect, sidesteps that rather
 * than papering over it.
 */

function stubNotification(initialPermission: NotificationPermission) {
  let permission = initialPermission;
  const requestPermission = vi.fn(async () => permission);

  Object.defineProperty(window, "Notification", {
    configurable: true,
    value: class {
      static get permission() {
        return permission;
      }
      static requestPermission = requestPermission;
    },
  });

  return {
    requestPermission,
    grant: () => {
      permission = "granted";
    },
    deny: () => {
      permission = "denied";
    },
  };
}

function stubServiceWorker() {
  // Typed explicitly so mock.calls carries the (title, options) tuple the
  // real ServiceWorkerRegistration#showNotification is called with — an
  // untyped vi.fn() here infers an empty-tuple call signature, since it is
  // never actually invoked in this file except through the hook.
  const showNotification = vi.fn<(title: string, options?: NotificationOptions) => Promise<void>>(
    async () => undefined,
  );
  const registration = { showNotification };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { ready: Promise.resolve(registration) },
  });
  return { showNotification };
}

afterEach(() => {
  vi.restoreAllMocks();
  // @ts-expect-error -- test-only cleanup of a property defineProperty added
  delete window.Notification;
  // @ts-expect-error -- same, for the serviceWorker stub
  delete navigator.serviceWorker;
});

describe("useFocusNotify", () => {
  it("resolves to 'unsupported' and stays safe when Notification does not exist", async () => {
    // The genuine SSR case: no stub at all, matching a server render where
    // the global is simply absent. request() and notify() must not throw —
    // both are reachable from a page that has not yet hydrated far enough
    // to know whether the API exists.
    const { result } = renderHook(() => useFocusNotify());

    await waitFor(() => expect(result.current.permission).toBe("unsupported"));

    await expect(result.current.request()).resolves.toBeUndefined();
    await expect(result.current.notify("title", "body")).resolves.toBeUndefined();
  });

  it("corrects to the real permission once mounted", async () => {
    stubNotification("granted");

    const { result } = renderHook(() => useFocusNotify());

    await waitFor(() => expect(result.current.permission).toBe("granted"));
  });

  it("reflects a fresh grant back through request()", async () => {
    const notification = stubNotification("default");

    const { result } = renderHook(() => useFocusNotify());
    await waitFor(() => expect(result.current.permission).toBe("default"));

    notification.grant();
    await result.current.request();

    expect(notification.requestPermission).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.permission).toBe("granted"));
  });

  it("shows a notification through the service worker registration when granted", async () => {
    stubNotification("granted");
    const sw = stubServiceWorker();

    const { result } = renderHook(() => useFocusNotify());
    await waitFor(() => expect(result.current.permission).toBe("granted"));

    await result.current.notify("Focus block done", "25 minutes — take a soft pause.");

    expect(sw.showNotification).toHaveBeenCalledTimes(1);
    const [title, options] = sw.showNotification.mock.calls[0];
    expect(title).toBe("Focus block done");
    expect(options).toBeDefined();
    expect(options?.body).toBe("25 minutes — take a soft pause.");
    // No badge, ever — see sw.js and the product's rule against anything
    // that accumulates into a tally on the home screen icon.
    expect(options).not.toHaveProperty("badge");
  });

  it("does nothing when permission has not been granted", async () => {
    stubNotification("default");
    const sw = stubServiceWorker();

    const { result } = renderHook(() => useFocusNotify());
    await waitFor(() => expect(result.current.permission).toBe("default"));

    await result.current.notify("Focus block done", "…");

    expect(sw.showNotification).not.toHaveBeenCalled();
  });

  it("does nothing once permission has been denied", async () => {
    stubNotification("denied");
    const sw = stubServiceWorker();

    const { result } = renderHook(() => useFocusNotify());
    await waitFor(() => expect(result.current.permission).toBe("denied"));

    await result.current.notify("Focus block done", "…");

    expect(sw.showNotification).not.toHaveBeenCalled();
  });
});
