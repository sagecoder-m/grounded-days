import { useEffect, useState } from "react";

/**
 * Whether a media query currently matches.
 *
 * Starts false on the server and on the first client render, then settles after
 * mount. That is deliberate: matchMedia does not exist during SSR, and guessing
 * a value would mean rendering one layout on the server and another on the
 * client, which React reports as a hydration mismatch. Callers should treat
 * false as "not yet known" and pick a default that is safe either way.
 */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const list = window.matchMedia(query);
    setMatches(list.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
