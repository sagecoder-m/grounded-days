// Resolves a share token into a read-only slice of one user's data.
//
// This is the only endpoint an anonymous reader can reach, and it must be
// deployed with --no-verify-jwt because a share viewer has no Supabase session.
// Everything it returns is assembled explicitly below: there is no "select *"
// anywhere and no pass-through of a client-supplied field list, so widening
// what a share exposes requires editing this file.
import { corsHeaders, jsonResponse, serviceClient } from "../_shared/supabase.ts";

/** How far ahead a share shows dated items. Matches the app's own horizon. */
/** How far back the summary reads. See the note where it is used. */
const SUMMARY_DAYS = 56;

const UPCOMING_DAYS = 60;

type Area = "personal" | "professional" | "education";

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("t") ?? "";
    // Length check first so obviously malformed tokens never reach the database.
    if (token.length < 20 || token.length > 200) {
      return jsonResponse({ error: "not_found" }, 404);
    }

    const db = serviceClient();

    const { data: link, error } = await db
      .from("share_links")
      .select("id, user_id, label, areas, expires_at, revoked_at")
      .eq("token_hash", await sha256Hex(token))
      .maybeSingle();

    // Revoked, expired and unknown all answer identically. Distinguishing them
    // would let someone with a dead link learn whether it ever existed.
    if (error || !link) return jsonResponse({ error: "not_found" }, 404);
    if (link.revoked_at) return jsonResponse({ error: "not_found" }, 404);
    if (link.expires_at && Date.parse(link.expires_at) < Date.now()) {
      return jsonResponse({ error: "not_found" }, 404);
    }

    const areas = (link.areas ?? []) as Area[];
    const userId = link.user_id as string;

    const today = new Date();
    const horizon = new Date(today.getTime() + UPCOMING_DAYS * 86_400_000);
    const todayStr = today.toISOString().slice(0, 10);
    const horizonStr = horizon.toISOString().slice(0, 10);

    /*
      How far back the summary looks.

      Eight weeks, because the audience for this link is a therapist or someone
      close, and the question they are actually asking is "how have the last
      couple of months gone" — not "what happened today". A shorter window turns
      one hard fortnight into the whole picture, which is the reading this page
      most needs to avoid.
    */
    const since = new Date(today.getTime() - SUMMARY_DAYS * 86_400_000);
    const sinceStr = since.toISOString().slice(0, 10);

    // Every query below is scoped by BOTH user_id and the link's areas. The
    // area filter is not cosmetic: it is what keeps a professional link from
    // returning personal rows.
    const [tasks, goals, events, habits, settings, finished, outstanding, checkins] =
      await Promise.all([
        db
          .from("tasks")
          .select("id, title, area, date, done")
          .eq("user_id", userId)
          .in("area", areas)
          .gte("date", todayStr)
          .lte("date", horizonStr)
          .order("date", { ascending: true }),
        db
          .from("goals")
          .select("id, name, area, progress")
          .eq("user_id", userId)
          .in("area", areas)
          .order("created_at", { ascending: true }),
        db
          .from("events")
          .select("id, title, area, date, starts_at, all_day")
          .eq("user_id", userId)
          .gte("date", todayStr)
          .lte("date", horizonStr)
          .order("date", { ascending: true }),
        // Habits carry no area and belong to Personal, so they are only ever
        // included when the link covers Personal.
        areas.includes("personal")
          ? db.from("habits").select("id, name").eq("user_id", userId)
          : Promise.resolve({ data: [], error: null }),
        db.from("user_settings").select("display_name").eq("user_id", userId).maybeSingle(),

        /*
        Finished work over the window, as dates and areas only — no titles.

        updated_at stands in for "when this was ticked". It is an approximation
        the app already relies on (see Task.updatedAt), and renaming a finished
        task moves it; being a few hours out costs nothing in an eight-week
        shape.
      */
        db
          .from("tasks")
          .select("area, updated_at")
          .eq("user_id", userId)
          .in("area", areas)
          .eq("done", true)
          .gte("updated_at", since.toISOString()),

        /*
        What is still open, at any date — including things with no date at all.

        Separate from the `tasks` query above, which is deliberately scoped to
        the upcoming fortnight for the "coming up" list. Support is most needed
        where work has been sitting, and sitting work is usually behind you.
      */
        db
          .from("tasks")
          .select("area, date")
          .eq("user_id", userId)
          .in("area", areas)
          .eq("done", false),

        /*
        Habit check-ins per day. Personal only, for the same reason the habits
        list is: habits carry no area and belong to Personal.
      */
        areas.includes("personal")
          ? db.from("habit_logs").select("date").eq("user_id", userId).gte("date", sinceStr)
          : Promise.resolve({ data: [], error: null }),
      ]);

    // Events with no area are ambiguous rather than safe, so they are only shown
    // on a link that covers every area. An unlabelled event on a Professional-only
    // link could just as easily be a doctor's appointment.
    const visibleEvents = (events.data ?? []).filter((e) =>
      e.area ? areas.includes(e.area as Area) : areas.length === 3,
    );

    // Best-effort: a failed counter must not deny the reader the page.
    const { error: viewError } = await db.rpc("record_share_view", { link_id: link.id });
    if (viewError) console.error("could not record share view", viewError);

    return jsonResponse({
      label: link.label,
      displayName: settings.data?.display_name ?? null,
      areas,
      // Descriptions and notes are deliberately absent from every collection —
      // titles and progress convey the shape of things without the private
      // detail people write in a description field.
      tasks: (tasks.data ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        area: t.area,
        date: t.date,
        done: t.done,
      })),
      goals: (goals.data ?? []).map((g) => ({
        id: g.id,
        name: g.name,
        area: g.area,
        progress: g.progress,
      })),
      events: visibleEvents.map((e) => ({
        id: e.id,
        title: e.title,
        area: e.area,
        date: e.date,
        startsAt: e.starts_at,
        allDay: e.all_day,
      })),
      habits: (habits.data ?? []).map((h) => ({ id: h.id, name: h.name })),

      /*
        The summary's raw material: counts and dates, never titles.

        Aggregated on the page rather than here, so the phrasing that turns
        these into sentences stays testable and stays in one place. What crosses
        the wire is deliberately thinner than what is already shared — an area
        and a date says how a fortnight went without saying what was in it.
      */
      since: sinceStr,
      completions: (finished.data ?? []).map((t) => ({
        area: t.area,
        date: String(t.updated_at).slice(0, 10),
      })),
      openWork: (outstanding.data ?? []).map((t) => ({
        area: t.area,
        // Null where there is no date. "Waiting" is decided on the page, so the
        // definition lives with the words that describe it.
        date: t.date,
      })),
      habitCheckins: (checkins.data ?? []).map((h) => ({ date: h.date })),
    });
  } catch (err) {
    console.error("share-view failed", err);
    return jsonResponse({ error: "server_error" }, 500);
  }
});
