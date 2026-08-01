import { useSyncExternalStore } from "react";
import type { QueryClient } from "@tanstack/react-query";

/**
 * Module-scoped handle to the QueryClient + signed-in user.
 *
 * The store exposes `actions` as a plain object so the ~38 existing call sites
 * keep working unchanged, which means the write path needs to reach the
 * QueryClient from outside React. This registry is how.
 *
 * It is safe as a module singleton specifically because mutations are
 * client-only: the server renders nothing behind the passcode gate, so it never
 * calls an action. AppGate registers on mount and clears on sign-out.
 *
 * It is also an external store rather than a plain variable, so reads via
 * useStoreContext() re-render when the signed-in user changes instead of
 * depending on effect ordering.
 */
export interface StoreContext {
  queryClient: QueryClient;
  userId: string;
}

let current: StoreContext | null = null;
const listeners = new Set<() => void>();

export function setStoreContext(next: StoreContext | null) {
  const same = current?.userId === next?.userId && current?.queryClient === next?.queryClient;
  if (same) return;
  current = next;
  listeners.forEach((listener) => listener());
}

export function peekStoreContext(): StoreContext | null {
  return current;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getServerSnapshot = (): StoreContext | null => null;

/** Reactive read — re-renders when the signed-in user changes. */
export function useStoreContext(): StoreContext | null {
  return useSyncExternalStore(subscribe, peekStoreContext, getServerSnapshot);
}

/** Throws if called before AppGate has registered a signed-in user. */
export function requireStoreContext(): StoreContext {
  if (!current) {
    throw new Error("No store context: an action ran before sign-in was established.");
  }
  return current;
}
