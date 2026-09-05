import { useEffect, useState } from "react";

/**
 * Whether this device is one you would actually handwrite on.
 *
 * True for a tablet, false for a phone and false for a desktop — which is the
 * rule as asked, and also the honest one. Handwriting needs a surface you can
 * rest a hand on and a stylus worth using: an iPhone is too small to write a
 * paragraph on, and a desktop has a mouse, which produces the worst handwriting
 * any of us has ever seen.
 *
 * Detected from the two things that are actually true of a tablet rather than
 * from a user-agent string, which lies — iPadOS has reported itself as a Mac
 * since version 13, so any check for "iPad" silently stopped working years ago
 * and would exclude the one device this feature is for.
 *
 * So: a coarse pointer somewhere on the device (a finger — desktops have none)
 * and enough width to write on (phones have none). A Surface or an Android
 * tablet passes too, which is correct; the feature is about the surface, not
 * the badge on it.
 *
 * Reading is never gated. Every device shows a handwritten page, because an
 * entry you cannot read back on your phone is an entry you have lost.
 */
const TABLET_QUERY = "(any-pointer: coarse) and (min-width: 768px)";

export function usePenSurface(): boolean {
  /*
    False until the client says otherwise.

    Server rendering has no device to ask, and guessing "tablet" would flash a
    handwriting pad onto a desktop for one frame before it corrected itself —
    the same class of bug as the theme defaulting to light. Starting closed and
    opening is the direction that never shows the wrong thing.
  */
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const media = window.matchMedia?.(TABLET_QUERY);
    if (!media) return;
    setOk(media.matches);
    const onChange = (e: MediaQueryListEvent) => setOk(e.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return ok;
}
