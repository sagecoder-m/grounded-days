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

/** How long the crossfade lasts. Slow enough to read as a change of light
 *  rather than a repaint, short enough not to feel like waiting. */
const TRANSITION_MS = 420;

/**
 * Paint the change rather than cut to it.
 *
 * The transition lives on a class that is added for the length of the fade and
 * then removed, instead of sitting permanently on every element. A standing
 * `transition: background-color` on the whole document would also animate every
 * hover, every card that appears, and every row that changes state — the theme
 * switch is the only moment this is wanted.
 *
 * Skipped on the very first application: there is nothing to fade *from* on a
 * page that has not been painted yet, and fading in from the boot script's
 * colours is a flash by another name.
 */
let painted = false;

function crossfade() {
  if (!painted) {
    painted = true;
    return;
  }
  const root = document.documentElement;
  root.classList.add("theme-transition");
  window.setTimeout(() => root.classList.remove("theme-transition"), TRANSITION_MS);
}

function apply(resolved: ResolvedTheme) {
  crossfade();
  /*
    Both classes, and the light one is not decorative.

    DayFlow ships its own dark theme scoped to `:root:not(.light):not(.dark)` —
    keyed to the operating system, not to this app. Writing only `dark` meant
    that in light mode on a machine set to dark, the root carried neither class
    and DayFlow's block took effect: a slate-blue calendar inside a cream app.
    Its context-menu half is worse, because it defines the variables on
    `.df-context-menu` itself, and a variable set on a nearer element beats one
    inherited from `:root` no matter what the layer order says. Marking light
    explicitly switches both blocks off.
  */
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.classList.toggle("light", resolved === "light");
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
 *
 * It writes `light` as well as `dark`, for the same reason apply() does: the
 * calendar's own stylesheet treats "neither class" as permission to use its
 * dark theme.
 *
 * With no cache it assumes light, which is the app's default. It used to ask
 * the operating system, which was right while "system" was the default and
 * wrong now — it made a first visit on a dark machine paint dark and then
 * correct itself to light a moment later.
 */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(
  THEME_CACHE_KEY,
)})||"light";var e=document.documentElement;e.classList.add(t==="dark"?"dark":"light");e.style.colorScheme=t}catch(e){}`;
