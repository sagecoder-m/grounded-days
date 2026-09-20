import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import { actions } from "@/lib/store";
import { useCaptureTimezone } from "./use-capture-timezone";

/**
 * The one behaviour worth locking down here is the gate, not the detection —
 * `Intl.DateTimeFormat` is a browser API this hook has no reason to second-
 * guess. What it must never do is write before `loaded` is true.
 *
 * actions.updateSettings merges its patch onto whatever the cache currently
 * holds and writes the *whole* merged settings object back (see the comment
 * on that action in mutations.ts) — so calling it before the real settings
 * row has arrived would merge a live timezone onto DEFAULT_SETTINGS and
 * silently overwrite theme, accent, and everything else a person actually
 * chose. That is a data-loss bug wearing a timezone hat, not a display glitch
 * — worth a sharper test than the usual "did the effect run" check.
 */

const REAL_ZONE = Intl.DateTimeFormat;

function mockTimeZone(zone: string) {
  vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
    () => ({ resolvedOptions: () => ({ timeZone: zone }) }) as unknown as Intl.DateTimeFormat,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  Intl.DateTimeFormat = REAL_ZONE;
});

describe("useCaptureTimezone", () => {
  it("writes nothing while settings are still loading, even if the zone differs", () => {
    mockTimeZone("America/New_York");
    const update = vi.spyOn(actions, "updateSettings").mockImplementation(() => {});

    renderHook(() => useCaptureTimezone("UTC", false));

    expect(update).not.toHaveBeenCalled();
  });

  it("writes the detected zone once settings have loaded and it differs", () => {
    mockTimeZone("America/New_York");
    const update = vi.spyOn(actions, "updateSettings").mockImplementation(() => {});

    renderHook(() => useCaptureTimezone("UTC", true));

    expect(update).toHaveBeenCalledExactlyOnceWith({ timezone: "America/New_York" });
  });

  it("writes nothing when the stored zone already matches the device", () => {
    mockTimeZone("America/New_York");
    const update = vi.spyOn(actions, "updateSettings").mockImplementation(() => {});

    renderHook(() => useCaptureTimezone("America/New_York", true));

    expect(update).not.toHaveBeenCalled();
  });

  it("re-checks if the loaded flag flips from false to true", () => {
    mockTimeZone("Europe/Lisbon");
    const update = vi.spyOn(actions, "updateSettings").mockImplementation(() => {});

    const { rerender } = renderHook(({ loaded }) => useCaptureTimezone("UTC", loaded), {
      initialProps: { loaded: false },
    });
    expect(update).not.toHaveBeenCalled();

    rerender({ loaded: true });
    expect(update).toHaveBeenCalledExactlyOnceWith({ timezone: "Europe/Lisbon" });
  });
});
