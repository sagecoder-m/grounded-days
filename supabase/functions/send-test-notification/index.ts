// Lets a signed-in person send themselves one push, on demand, to confirm
// their own device is actually wired up — the same kind of "Sync now" escape
// hatch calendar-sync already offers, for the same reason: waiting up to 15
// minutes for the next scheduled tick is a bad way to find out something is
// broken.
//
// Authenticated by requireUser(), which resolves the caller strictly from
// their own bearer token (see _shared/supabase.ts) — there is no userId
// field anywhere in the request body, so there is no way to ask this
// function to notify anyone but yourself.
import {
  corsHeaders,
  jsonResponse,
  requireEnv,
  requireUser,
  serviceClient,
  HttpError,
} from "../_shared/supabase.ts";
import webpush from "npm:web-push@3.6.7";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const caller = await requireUser(req);
    const db = serviceClient();

    try {
      webpush.setVapidDetails(
        requireEnv("VAPID_SUBJECT"),
        requireEnv("VAPID_PUBLIC_KEY"),
        requireEnv("VAPID_PRIVATE_KEY"),
      );
    } catch (err) {
      return jsonResponse({ error: (err as Error).message }, 503);
    }

    const { data: subscriptions, error } = await db
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", caller.id);
    if (error) throw new Error(error.message);
    if (!subscriptions || subscriptions.length === 0) {
      return jsonResponse({ error: "No push subscription registered on this device yet." }, 404);
    }

    const payload = JSON.stringify({
      title: "Test Notification",
      body: "Push notifications are working.",
      url: "/profile",
    });

    let sent = 0;
    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.from("push_subscriptions").delete().eq("id", subscription.id);
        }
      }
    }

    return jsonResponse({ sent, of: subscriptions.length });
  } catch (err) {
    if (err instanceof HttpError) return jsonResponse({ error: err.message }, err.status);
    console.error("send-test-notification failed", (err as Error).message);
    return jsonResponse({ error: "Something went wrong." }, 500);
  }
});
