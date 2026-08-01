/**
 * Passcode state: whether one is set, whether this tab is unlocked, and the
 * calls that set / change / verify it.
 *
 * Unlock lives in sessionStorage, so it survives a refresh in the same tab but
 * dies when the tab closes. localStorage would persist across browser restarts
 * and defeat the lock; pure in-memory state would force re-entry on every
 * refresh. A 30-minute idle timeout auto-relocks.
 *
 * Verification is a SECURITY DEFINER RPC. The hash never reaches the client, so
 * it cannot be brute-forced offline, and the attempt/lockout counters live in
 * Postgres where they actually bind.
 */
import { useCallback, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { qk } from "./db/keys";

const SESSION_KEY = "grounded.unlock.v1";
const IDLE_MS = 30 * 60 * 1000;
const ACTIVITY_THROTTLE_MS = 30 * 1000;
const IDLE_CHECK_MS = 60 * 1000;

/** Attempts allowed before lockout. Mirrors max_attempts in verify_passcode. */
export const MAX_ATTEMPTS = 5;

interface UnlockRecord {
  unlockedAt: number;
  lastActivityAt: number;
}

let unlocked = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function readRecord(): UnlockRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UnlockRecord>;
    if (typeof parsed.unlockedAt !== "number" || typeof parsed.lastActivityAt !== "number") {
      return null;
    }
    return { unlockedAt: parsed.unlockedAt, lastActivityAt: parsed.lastActivityAt };
  } catch {
    return null;
  }
}

function writeRecord(record: UnlockRecord) {
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(record));
  } catch {
    // Private-mode or quota failure: the tab stays unlocked in memory only.
  }
}

function clearRecord() {
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

/** Marks this tab unlocked. Called after a successful verify or first setup. */
export function markUnlocked() {
  if (typeof window === "undefined") return;
  const now = Date.now();
  writeRecord({ unlockedAt: now, lastActivityAt: now });
  unlocked = true;
  notify();
}

/** Relocks immediately — used on idle timeout and on sign-out. */
export function lockNow() {
  if (typeof window !== "undefined") clearRecord();
  unlocked = false;
  notify();
}

function touchActivity() {
  if (!unlocked) return;
  const record = readRecord();
  if (!record) return;
  const now = Date.now();
  if (now - record.lastActivityAt < ACTIVITY_THROTTLE_MS) return;
  writeRecord({ ...record, lastActivityAt: now });
}

function checkIdle() {
  if (!unlocked) return;
  const record = readRecord();
  if (!record || Date.now() - record.lastActivityAt > IDLE_MS) lockNow();
}

// Resolved at module load on the client so the very first client render already
// has the right value. AppGate gates on useMounted() before reading this, so
// hydration still matches the server's locked render.
if (typeof window !== "undefined") {
  const record = readRecord();
  if (record && Date.now() - record.lastActivityAt <= IDLE_MS) {
    unlocked = true;
  } else if (record) {
    clearRecord();
  }
}

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "visibilitychange"] as const;

let idleTimer: number | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);

  // First subscriber wires up the shared activity/idle watchers.
  if (listeners.size === 1 && typeof window !== "undefined") {
    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, touchActivity, { passive: true }),
    );
    idleTimer = window.setInterval(checkIdle, IDLE_CHECK_MS);
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, touchActivity));
      if (idleTimer !== undefined) {
        window.clearInterval(idleTimer);
        idleTimer = undefined;
      }
    }
  };
}

const getSnapshot = (): boolean => unlocked;
const getServerSnapshot = (): boolean => false;

/** Whether this tab is currently unlocked. */
export function useUnlocked(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Whether the signed-in user has a passcode set at all. */
export function useHasPasscode(userId: string | null) {
  return useQuery({
    queryKey: qk.hasPasscode(userId ?? "anonymous"),
    enabled: Boolean(userId),
    staleTime: Infinity,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_passcode");
      if (error) throw new Error(error.message);
      return data === true;
    },
  });
}

export interface VerifyResult {
  ok: boolean;
  reason: "ok" | "wrong" | "locked" | "not_set";
  lockedUntil: string | null;
  attemptsRemaining: number | null;
}

/** Verifies a passcode. Never returns the hash; lockout is enforced in Postgres. */
export async function verifyPasscode(candidate: string): Promise<VerifyResult> {
  const { data, error } = await supabase.rpc("verify_passcode", { candidate });
  if (error) throw new Error(error.message);
  const raw = (data ?? {}) as Record<string, unknown>;
  return {
    ok: raw.ok === true,
    reason: (raw.reason as VerifyResult["reason"]) ?? "wrong",
    lockedUntil: typeof raw.locked_until === "string" ? raw.locked_until : null,
    attemptsRemaining: typeof raw.attempts_remaining === "number" ? raw.attempts_remaining : null,
  };
}

/** First-run only. The RPC rejects this if a passcode already exists. */
export async function setPasscode(newPasscode: string): Promise<void> {
  const { error } = await supabase.rpc("set_passcode", { new_passcode: newPasscode });
  if (error) throw new Error(error.message);
}

/** Returns false when the old passcode didn't match. */
export async function changePasscode(oldPasscode: string, newPasscode: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("change_passcode", {
    old_passcode: oldPasscode,
    new_passcode: newPasscode,
  });
  if (error) throw new Error(error.message);
  return data === true;
}

/** Shared helper for the "how long until I can try again" copy. */
export function useLockCountdown() {
  return useCallback((lockedUntil: string | null) => {
    if (!lockedUntil) return null;
    const ms = Date.parse(lockedUntil) - Date.now();
    if (Number.isNaN(ms) || ms <= 0) return null;
    const minutes = Math.ceil(ms / 60_000);
    return minutes <= 1 ? "about a minute" : `about ${minutes} minutes`;
  }, []);
}
