import { describe, expect, it, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

import { THEME_CACHE_KEY, useTheme } from "./use-theme";

/**
 * The regression these cover is a reported one, and worth naming precisely:
 * switching a device to dark, reloading, and watching the page come up dark,
 * turn light, then turn dark again a beat later.
 *
 * The cause was that the theme setting lives in the database and everything
 * else in the app is happy to show DEFAULT_SETTINGS while a query is in flight.
 * For a list that is harmless. For theme the default is "light", which is a
 * real, applicable answer — indistinguishable from the account actually being
 * light — so the app applied it, and then applied the true answer on top.
 *
 * So what is tested here is the doing of nothing.
 */
describe("useTheme", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    document.documentElement.style.colorScheme = "";
    window.localStorage.clear();
  });

  it("leaves the document alone while the setting is still loading", () => {
    // What the boot script painted from the cache, before React ran at all.
    document.documentElement.classList.add("dark");
    window.localStorage.setItem(THEME_CACHE_KEY, "dark");

    // The placeholder the store hands out until the settings query lands.
    renderHook(() => useTheme("light", false));

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
  });

  it("does not overwrite the cache with the placeholder", () => {
    // The nastier half of the same bug: apply() writes what it applied into the
    // cache the boot script reads next time. A tab closed during the load
    // window therefore taught the *next* load to start light too, which is how
    // a transient flash turned into a preference that appeared to have been
    // forgotten.
    window.localStorage.setItem(THEME_CACHE_KEY, "dark");

    renderHook(() => useTheme("light", false));

    expect(window.localStorage.getItem(THEME_CACHE_KEY)).toBe("dark");
  });

  it("applies the setting once it is known", () => {
    const { rerender } = renderHook(({ known }: { known: boolean }) => useTheme("dark", known), {
      initialProps: { known: false },
    });

    expect(document.documentElement.classList.contains("dark")).toBe(false);

    rerender({ known: true });

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    // Light is written explicitly too — the calendar's own stylesheet reads
    // "neither class" as permission to use its dark theme.
    expect(document.documentElement.classList.contains("light")).toBe(false);
    expect(window.localStorage.getItem(THEME_CACHE_KEY)).toBe("dark");
  });

  it("writes light explicitly, rather than just clearing dark", () => {
    const { rerender } = renderHook<void, { t: "light" | "dark" }>(({ t }) => useTheme(t, true), {
      initialProps: { t: "dark" },
    });
    rerender({ t: "light" });

    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");
  });
});
