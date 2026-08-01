import { useEffect, useState } from "react";

/**
 * False during SSR and on the first client render, true after mount.
 *
 * Used to gate anything that depends on browser-only state (localStorage,
 * sessionStorage, the current time) so the server and the first client render
 * agree. This eliminates hydration mismatches rather than suppressing them.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
