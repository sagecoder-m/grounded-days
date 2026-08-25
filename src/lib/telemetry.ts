/**
 * Privacy-bounded usage telemetry for the pilot.
 *
 * What leaves the browser: an event NAME from the allowlist below, the current
 * route, and nothing else — the server adds the user id (RLS insists it match
 * the JWT) and the timestamp. There is no payload parameter on track() at all,
 * so a future call site cannot quietly attach a task title; the temptation has
 * no door. The database enforces the same shape with a charset check.
 *
 * Every send is fire-and-forget and swallows its own failures. Telemetry that
 * can break the app, slow the app, or toast at the user is worse than none.
 */
import { supabase } from "@/integrations/supabase/client";
import { peekStoreContext } from "@/lib/db/context";

/**
 * The complete vocabulary. Fails closed: an event not named here does not get
 * recorded, and adding one is a deliberate, reviewable act.
 */
const EVENTS = [
  "page_view",
  "task_add",
  "task_toggle",
  "event_add",
  "event_move",
  "habit_add",
  "habit_toggle",
  "goal_add",
  "course_add",
  "journal_entry_add",
  "assistant_message",
  "focus_session",
] as const;

export type UsageEvent = (typeof EVENTS)[number];

/** One route per event row, path only — never query strings, which can carry
 *  tokens (the OAuth callback lands with one). */
function currentRoute(): string {
  if (typeof window === "undefined") return "ssr";
  return window.location.pathname.slice(0, 80);
}

let lastPageViewRoute: string | null = null;

/**
 * Events fired by a debounce rather than a gesture, throttled so one writing
 * session counts once. saveJournalEntry saves per typing pause; counting each
 * pause would make the journal look ten times busier than any other section.
 */
const CONTINUOUS_EVENTS: Partial<Record<UsageEvent, number>> = {
  journal_entry_add: 5 * 60_000,
};
const lastSent = new Map<UsageEvent, number>();

export function track(event: UsageEvent) {
  if (!(EVENTS as readonly string[]).includes(event)) return;
  const ctx = peekStoreContext();
  // Signed out (or the passcode gate) — nothing to attribute, so nothing sent.
  if (!ctx) return;

  const throttle = CONTINUOUS_EVENTS[event];
  if (throttle) {
    const now = Date.now();
    if (now - (lastSent.get(event) ?? 0) < throttle) return;
    lastSent.set(event, now);
  }

  const route = currentRoute();
  // A page_view per navigation, not per render: React re-mounts are not visits.
  if (event === "page_view") {
    if (route === lastPageViewRoute) return;
    lastPageViewRoute = route;
  }

  void supabase
    .from("usage_events")
    .insert({ user_id: ctx.userId, event, route })
    .then(
      () => undefined,
      () => undefined,
    );
}

/** Reset the page_view dedupe on sign-out so the next session logs its landing. */
export function resetTelemetry() {
  lastPageViewRoute = null;
}

// ------------------------------------------------------------------ errors

/** Hard cap per session. An error loop must not become a write loop. */
const MAX_ERRORS_PER_SESSION = 5;
let errorsSent = 0;
let hooked = false;

function report(message: string, stack: string | null) {
  const ctx = peekStoreContext();
  if (!ctx || errorsSent >= MAX_ERRORS_PER_SESSION) return;
  errorsSent += 1;
  void supabase
    .from("client_errors")
    .insert({
      user_id: ctx.userId,
      message: String(message).slice(0, 500),
      stack: stack ? String(stack).slice(0, 4000) : null,
      route: currentRoute(),
      user_agent: navigator.userAgent.slice(0, 300),
    })
    .then(
      () => undefined,
      () => undefined,
    );
}

/**
 * Install the global error hooks. Idempotent, and additive — listeners rather
 * than assignment, so nothing else's onerror handler is displaced.
 */
export function installErrorReporting() {
  if (hooked || typeof window === "undefined") return;
  hooked = true;
  window.addEventListener("error", (e) => {
    report(e.message || "Unknown error", e.error?.stack ?? null);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason;
    report(
      reason instanceof Error ? reason.message : String(reason ?? "Unhandled rejection"),
      reason instanceof Error ? (reason.stack ?? null) : null,
    );
  });
}
