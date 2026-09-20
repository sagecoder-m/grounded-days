import { useEffect } from "react";

import { actions } from "@/lib/store";

/**
 * Writes the browser's IANA timezone to the account once it differs from
 * what is stored — the one thing that lets a server-side schedule know when
 * "8am" or "11:59pm" actually is for this person. Due times are kept
 * timezone-naive on purpose (see 20260831230000_assignment_due_time.sql:
 * "11:59pm" is 11:59pm where the student is, not an instant on a global
 * clock), which is the right call for a date a person types in — but it
 * leaves a real gap for anything running server-side, since a cron job has
 * no timezone of its own to fall back on.
 *
 * `loaded` is load-bearing, not decorative. actions.updateSettings merges
 * its patch onto whatever the cache currently holds and writes the *whole*
 * merged settings object back (see the comment on that action) — so firing
 * this before the real settings row has arrived would merge a live
 * timezone onto DEFAULT_SETTINGS and write defaults over theme, accent, and
 * everything else a person actually chose. Same class of bug as the theme
 * flash and the calendar building from an empty event list elsewhere in
 * this codebase: trust nothing that looks like a real answer until it is
 * confirmed to be one.
 */
export function useCaptureTimezone(storedTimezone: string, loaded: boolean) {
  useEffect(() => {
    if (!loaded) return;

    let detected: string;
    try {
      detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      // A handful of very old or locked-down browsers throw here rather
      // than returning "UTC". Leaving the stored value alone is correct —
      // UTC is already the column's own default for exactly this case.
      return;
    }

    if (detected && detected !== storedTimezone) {
      actions.updateSettings({ timezone: detected });
    }
  }, [storedTimezone, loaded]);
}
