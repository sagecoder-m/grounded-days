import { useEffect, useSyncExternalStore } from "react";

import type { Theme } from "@/lib/store-types";

/**
 * Light or dark, applied to the document.
 *
 * The stylesheet's dark palette is selected by a `dark` class, and until now
 * nothing ever wrote one. This is the piece that does.
 *
 * On the document element rather than the app shell, because the shell is not
 * the whole page: the sign-in screen, the passcode lock and the area behind an
 * overscroll bounce all sit outside it, and a theme that stops at the edge of
 * the layout is worse than no theme at all.
 */

/**
 * Where the resolved choice is mirrored for the boot script below.
 *
 * The setting itself lives in the database, which is the right place for
 * something that should follow you between devices — but it arrives a moment
 * after the page does, and a moment of cream in a dark room is exactly the
 * flash this avoids. So the last known answer is kept here too, on the device,
 * purely so the first paint can be right. The database stays the source of
 * truth; this is a cache that only ever loses an argument with it.
 */
export const THEME_CACHE_KEY = "grounded.theme";

export type ResolvedTheme = "light" | "dark";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** What "system" currently means. Light when nothing can be asked. */
export function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.(DARK_QUERY).matches ? "dark" : "light";
}

export function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === "system" ? systemTheme() : theme;
}

function apply(resolved: ResolvedTheme) {
  document.documentElement.classList.toggle("dark", resolved === "dark");
  // Native controls — scrollbars, form widgets, the address bar on mobile —
  // read this rather than the class, and a dark page with a bright white
  // scrollbar down the side looks like a rendering fault.
  document.documentElement.style.colorScheme = resolved;
  try {
    window.localStorage.setItem(THEME_CACHE_KEY, resolved);
  } catch {
    // Private browsing, or storage the user has switched off. The cache is an
    // optimisation for the next load; losing it costs one flash, not the theme.
  }
}

/**
 * Keep the document in step with the setting.
 *
 * The system listener is the reason this is a hook rather than a one-off call:
 * on "system", the answer can change while the page is open — at sunset, or
 * when someone flips their laptop's appearance — and the app should follow
 * without being reloaded.
 */
export function useTheme(theme: Theme) {
  useEffect(() => {
    apply(resolveTheme(theme));
    if (theme !== "system") return;

    const media = window.matchMedia?.(DARK_QUERY);
    if (!media) return;
    const onChange = () => apply(systemTheme());
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);
}

/**
 * What is actually on screen right now, as something React re-renders for.
 *
 * resolveTheme() on its own is read once, at render, and a device that changes
 * its appearance does not re-render anything — so a control drawn from it goes
 * quietly stale. The consequence is not cosmetic: a toggle showing "switch to
 * dark" while the screen is already dark sets dark, and pressing a button
 * changes nothing at all, which is the most confusing failure a button has.
 */
export function useResolvedTheme(theme: Theme): ResolvedTheme {
  const system = useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia?.(DARK_QUERY);
      media?.addEventListener("change", onChange);
      return () => media?.removeEventListener("change", onChange);
    },
    systemTheme,
    // The server has no device to ask. Light matches the boot script's own
    // fallback, so the first client render agrees with the served HTML.
    () => "light" as ResolvedTheme,
  );
  return theme === "system" ? system : theme;
}

/**
 * The script that runs before the first paint.
 *
 * Inline and synchronous in the document head on purpose: anything deferred,
 * imported or run from React happens after the browser has already painted a
 * cream page, which is the flash. It reads the cache written above and nothing
 * else, so it cannot be slow and cannot fail in a way that matters — a throw
 * inside the try leaves the page light, which is where it started.
 */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(
  THEME_CACHE_KEY,
)});if(!t)t=matchMedia("${DARK_QUERY}").matches?"dark":"light";if(t==="dark"){document.documentElement.classList.add("dark")}document.documentElement.style.colorScheme=t}catch(e){}`;
