// Sends the two server-side notification types from
// docs/PUSH_NOTIFICATIONS_PLAN.md — a task's due time, and the morning
// one-thing line. The focus timer's notification is not here at all: it is
// client-only, fired directly from the open tab (see use-focus-notify.ts),
// because it needs nothing this function has to offer.
//
// Invoked only by the schedule (ops.run_send_notifications, every 15
// minutes), never by a client — there is no legitimate "send mine now"
// button for either of these the way there is a "Sync now" for calendars.
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { corsHeaders, jsonResponse, requireEnv, serviceClient } from "../_shared/supabase.ts";
import { affirmationForDate } from "../_shared/affirmations.ts";
import { morningCopy, taskDueCopy } from "../_shared/notification-copy.ts";

/**
 * How far ahead of a due time to warn, and how late a morning line may still
 * go out.
 *
 * Both windows are generous on purpose. The actual "has this already been
 * sent" decision is made once, by the unique constraint on
 * notifications_sent — see that table's own comment — so a wide window here
 * only means a candidate is *considered* on more ticks, never that it is
 * sent more than once. Narrowing it would only add a way to miss the moment
 * by being too strict, for no corresponding safety benefit.
 */
const TASK_DUE_LEAD_MINUTES = 180; // three hours
const MORNING_GRACE_MINUTES = 120; // two hours

interface SettingsRow {
  user_id: string;
  timezone: string;
  notify_task_due: boolean;
  notify_morning: boolean;
  notify_morning_at: string;
}

interface TaskRow {
  id: string;
  title: string;
  date: string | null;
  due_time: string | null;
  course_id: string | null;
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** This user's own wall-clock date and time-of-day, in minutes since
 *  midnight — not converted to or compared against UTC anywhere. Due times
 *  and notify_morning_at are stored as naive local values for exactly this
 *  person, so comparing them against this person's own local "now" needs no
 *  timezone math at all; both sides are already the same frame of
 *  reference. */
function localNow(timezone: string): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * The next thing to name in a morning line, using the exact ranking rule
 * pickOneThing documents in src/lib/user-insights.ts: due-or-overdue first,
 * then dated ahead of today, then undated — oldest date within a rank wins.
 * Reimplemented rather than imported for the same reason as affirmations.ts:
 * this function's own runtime never reaches outside its tree.
 *
 * "There is no priority field in this app, and inventing one here would be
 * inventing a judgement" — the same restraint applies to this copy.
 */
function pickOneThing(tasks: { id: string; title: string; date: string | null }[], today: string) {
  if (tasks.length === 0) return null;
  const rank = (t: { date: string | null }) => (t.date ? (t.date <= today ? 0 : 1) : 2);
  return [...tasks].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    return (a.date ?? "9999").localeCompare(b.date ?? "9999");
  })[0];
}

/**
 * Sends one push, and prunes the subscription on a permanent failure.
 *
 * 404/410 is the push service itself saying this endpoint will never accept
 * anything again — the browser it belonged to unregistered, or the
 * subscription simply expired. That is not a delivery failure to retry, it
 * is the client telling the sender to stop, so the row is deleted outright
 * rather than just having its failure_count bumped. Anything else increments
 * the count and leaves the row, since a single 500 from the push service is
 * not evidence the subscription is dead.
 */
async function send(
  db: ReturnType<typeof serviceClient>,
  subscription: SubscriptionRow,
  payload: { title: string; body: string },
): Promise<boolean> {
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
    );
    return true;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      await db.from("push_subscriptions").delete().eq("id", subscription.id);
    } else {
      // Not atomic, and deliberately not worth making atomic: this is a
      // best-effort counter for a human to eyeball later, not a value
      // anything else here reads or branches on. Losing an increment to a
      // race with another tick costs nothing real.
      const { data: row } = await db
        .from("push_subscriptions")
        .select("failure_count")
        .eq("id", subscription.id)
        .maybeSingle();
      await db
        .from("push_subscriptions")
        .update({ failure_count: (row?.failure_count ?? 0) + 1 })
        .eq("id", subscription.id);
    }
    return false;
  }
}

/**
 * Claims the right to send, via the unique constraint — see
 * notifications_sent's own comment for why this insert is the actual gate
 * rather than a check beforehand. Returns whether this call won the claim.
 */
async function claim(
  db: ReturnType<typeof serviceClient>,
  userId: string,
  kind: "task_due" | "morning",
  refId: string,
  forDate: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("notifications_sent")
    .insert({ user_id: userId, kind, ref_id: refId, for_date: forDate })
    .select("id");
  if (error) {
    // A unique-violation is the expected "someone already claimed this" case
    // and is not logged as a failure; anything else is worth knowing about.
    if (!error.message.includes("duplicate key")) console.error("claim failed", error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Service-role only. Verified the same way calendar-sync verifies its own
  // schedule caller: ask Supabase whether this bearer token can reach the
  // admin API, rather than comparing it byte-for-byte against this
  // function's own copy of the secret, which silently stops matching the
  // moment either copy is rotated without the other.
  const authHeader = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!authHeader) return jsonResponse({ error: "Missing bearer token" }, 401);
  const asCaller = createClient(requireEnv("SUPABASE_URL"), authHeader);
  const { error: privilegeError } = await asCaller.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (privilegeError) return jsonResponse({ error: "Invalid token" }, 401);

  const db = serviceClient();

  try {
    webpush.setVapidDetails(
      requireEnv("VAPID_SUBJECT"),
      requireEnv("VAPID_PUBLIC_KEY"),
      requireEnv("VAPID_PRIVATE_KEY"),
    );
  } catch (err) {
    // Missing VAPID secrets is a setup step nobody has finished yet, not a
    // bug — same posture as run_calendar_sync's own missing-secret notice.
    console.warn("send-notifications skipped:", (err as Error).message);
    return jsonResponse({ skipped: true });
  }

  const { data: settingsRows, error: settingsError } = await db
    .from("user_settings")
    .select("user_id, timezone, notify_task_due, notify_morning, notify_morning_at")
    .or("notify_task_due.eq.true,notify_morning.eq.true");
  if (settingsError) throw new Error(`settings lookup failed: ${settingsError.message}`);

  const results: Record<string, unknown>[] = [];

  for (const settings of (settingsRows ?? []) as SettingsRow[]) {
    // Independent per person: one account's bad row must not stop every
    // other account's notifications for this tick.
    try {
      const { data: subscriptions } = await db
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .eq("user_id", settings.user_id);
      if (!subscriptions || subscriptions.length === 0) continue;

      const { date: today, minutes: nowMinutes } = localNow(settings.timezone);
      const candidates: {
        title: string;
        body: string;
        kind: "task_due" | "morning";
        refId: string;
      }[] = [];

      if (settings.notify_task_due) {
        const { data: dueTasks } = await db
          .from("tasks")
          .select("id, title, date, due_time, course_id")
          .eq("user_id", settings.user_id)
          .eq("done", false)
          .eq("date", today)
          .not("due_time", "is", null);

        for (const task of (dueTasks ?? []) as TaskRow[]) {
          const dueMinutes = minutesOf(task.due_time!);
          const untilDue = dueMinutes - nowMinutes;
          // Only ahead of now, and only within the lead window — a task
          // already due today does not retroactively fire, matching the
          // rest of this app's rule against anything that reads as "you
          // missed this."
          if (untilDue <= 0 || untilDue > TASK_DUE_LEAD_MINUTES) continue;

          let courseTag: string | null = null;
          if (task.course_id) {
            const { data: course } = await db
              .from("courses")
              .select("code, name")
              .eq("id", task.course_id)
              .maybeSingle();
            if (course) courseTag = course.code || course.name;
          }

          candidates.push({
            ...taskDueCopy({ title: task.title, dueTime: task.due_time!, courseTag }),
            kind: "task_due",
            refId: task.id,
          });
        }
      }

      if (settings.notify_morning) {
        const morningMinutes = minutesOf(settings.notify_morning_at);
        const sinceMorning = nowMinutes - morningMinutes;
        if (sinceMorning >= 0 && sinceMorning <= MORNING_GRACE_MINUTES) {
          const { data: openTasks } = await db
            .from("tasks")
            .select("id, title, date")
            .eq("user_id", settings.user_id)
            .eq("done", false);

          const picked = pickOneThing((openTasks ?? []) as TaskRow[], today);
          candidates.push({
            ...morningCopy(picked?.title ?? null, affirmationForDate(today).text),
            kind: "morning",
            refId: "daily",
          });
        }
      }

      for (const candidate of candidates) {
        const won = await claim(db, settings.user_id, candidate.kind, candidate.refId, today);
        if (!won) continue;

        let sent = 0;
        for (const subscription of subscriptions as SubscriptionRow[]) {
          const ok = await send(db, subscription, { title: candidate.title, body: candidate.body });
          if (ok) sent++;
        }
        results.push({ userId: settings.user_id, kind: candidate.kind, sent });
      }
    } catch (err) {
      console.error(`notification pass failed for ${settings.user_id}`, (err as Error).message);
      results.push({ userId: settings.user_id, error: (err as Error).message });
    }
  }

  return jsonResponse({ processed: results.length, results });
});
