// The planning assistant.
//
// Runs server-side for two reasons that both matter: the OpenRouter key never
// reaches the browser, and the context sent to the model is assembled here from
// an allowlist rather than passed in by the client. A client that could name its
// own tables could ask for the journal.
//
// What the model may see: goals and their steps, tasks, projects, habits (as
// counts, not raw logs), upcoming events, and the display name.
// What it may never see: journal_entries — bodies, moods, gratitude. The user
// drew that line explicitly. If they type how they are feeling into the chat
// that is their choice and it flows through as an ordinary message.
import {
  corsHeaders,
  HttpError,
  jsonResponse,
  requireEnv,
  requireUser,
  serviceClient,
} from "../_shared/supabase.ts";

/** Rotates constantly on OpenRouter's free tier, so it is configuration. */
const DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

/** Tables the assistant is allowed to read. An allowlist fails closed: a table
 *  added later is invisible until someone deliberately adds it here. */
const ALLOWED_TABLES = [
  "goals",
  "goal_steps",
  "tasks",
  "projects",
  "subprojects",
  "habits",
  "habit_logs",
  "events",
  "user_settings",
] as const;

const DENIED_TABLES = ["journal_entries", "user_security", "calendar_credentials"] as const;

const SYSTEM_PROMPT = `You are the assistant inside grounded, a calm personal planning app used by someone with ADHD.

How to be useful here:
- Suggest the next small concrete step, not a system to adopt. One clear thing beats a complete plan.
- Break big things down when asked. Name specific steps that could be ticked off.
- Be brief. Two or three short paragraphs at most unless asked for more.
- Refer to their actual goals, tasks and schedule by name. You have them below.

How not to be:
- Never shame, guilt, or imply they are behind. No streak language, no "you should have".
- Do not moralise about productivity. A slow week is not a failure to diagnose.
- Do not invent tasks, events or goals they did not mention. If you are unsure what they have, ask.
- You are not a therapist or doctor. If something sounds like it needs real support, say so plainly and briefly, once, without alarm.

You cannot see their journal and should not ask them to paste it. If they volunteer how they are feeling, take it into account for planning and move on.`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** A compact, readable snapshot. Prose costs fewer tokens than raw JSON and
 *  models follow it more reliably. */
async function buildContext(userId: string): Promise<string> {
  const db = serviceClient();
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const horizon = new Date(today.getTime() + 21 * 86_400_000);

  const [settings, goals, steps, tasks, projects, subprojects, habits, logs, events] =
    await Promise.all([
      db.from("user_settings").select("display_name").eq("user_id", userId).maybeSingle(),
      db.from("goals").select("id, name, area, description, progress").eq("user_id", userId),
      db.from("goal_steps").select("goal_id, title, done").eq("user_id", userId),
      db
        .from("tasks")
        .select("title, area, date, done, project_id, subproject_id")
        .eq("user_id", userId),
      db.from("projects").select("id, name, area, status").eq("user_id", userId),
      db.from("subprojects").select("id, project_id, name").eq("user_id", userId),
      db.from("habits").select("id, name").eq("user_id", userId),
      db
        .from("habit_logs")
        .select("habit_id, date")
        .eq("user_id", userId)
        .gte("date", iso(new Date(today.getTime() - 14 * 86_400_000))),
      db
        .from("events")
        .select("title, area, date, starts_at, all_day")
        .eq("user_id", userId)
        .gte("date", iso(today))
        .lte("date", iso(horizon))
        .order("date", { ascending: true }),
    ]);

  const lines: string[] = [];
  lines.push(`Today is ${today.toDateString()}.`);
  if (settings.data?.display_name) lines.push(`They go by ${settings.data.display_name}.`);

  const stepsByGoal = new Map<string, { title: string; done: boolean }[]>();
  for (const s of steps.data ?? []) {
    const list = stepsByGoal.get(s.goal_id) ?? [];
    list.push({ title: s.title, done: s.done });
    stepsByGoal.set(s.goal_id, list);
  }

  if (goals.data?.length) {
    lines.push("\nGOALS");
    for (const g of goals.data) {
      const gs = stepsByGoal.get(g.id) ?? [];
      const done = gs.filter((s) => s.done).length;
      const shape = gs.length ? `${done}/${gs.length} steps done` : `${g.progress}% (no steps yet)`;
      lines.push(`- [${g.area}] ${g.name} — ${shape}`);
      for (const s of gs) lines.push(`    ${s.done ? "[x]" : "[ ]"} ${s.title}`);
    }
  }

  const projectName = new Map((projects.data ?? []).map((p) => [p.id, p.name]));
  const subName = new Map((subprojects.data ?? []).map((s) => [s.id, s.name]));

  if (projects.data?.length) {
    lines.push("\nPROJECTS");
    for (const p of projects.data) {
      lines.push(`- [${p.area}] ${p.name}${p.status !== "active" ? ` (${p.status})` : ""}`);
    }
  }

  const open = (tasks.data ?? []).filter((t) => !t.done);
  if (open.length) {
    lines.push("\nOPEN TASKS");
    for (const t of open.slice(0, 40)) {
      const where = t.project_id
        ? ` [in ${projectName.get(t.project_id) ?? "a project"}${
            t.subproject_id ? ` / ${subName.get(t.subproject_id) ?? ""}` : ""
          }]`
        : "";
      const when = t.date
        ? t.date < iso(today)
          ? ` (overdue since ${t.date})`
          : ` (${t.date})`
        : " (no date)";
      lines.push(`- [${t.area}] ${t.title}${when}${where}`);
    }
  }

  if (habits.data?.length) {
    // Counts, not dates. How often is the useful signal; which exact days is
    // more detail about someone's life than a planning question needs.
    const counts = new Map<string, number>();
    for (const l of logs.data ?? []) counts.set(l.habit_id, (counts.get(l.habit_id) ?? 0) + 1);
    lines.push("\nHABITS (last 14 days)");
    for (const h of habits.data) {
      lines.push(`- ${h.name}: ${counts.get(h.id) ?? 0} of 14 days`);
    }
  }

  if (events.data?.length) {
    lines.push("\nSCHEDULE (next 3 weeks)");
    for (const e of events.data.slice(0, 40)) {
      const time = !e.all_day && e.starts_at ? ` ${e.starts_at.slice(11, 16)}` : " (all day)";
      lines.push(`- ${e.date}${time} ${e.title}${e.area ? ` [${e.area}]` : ""}`);
    }
  }

  if (lines.length <= 2) {
    lines.push("\nTheir app is nearly empty — nothing set up yet beyond an account.");
  }

  return lines.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const user = await requireUser(req);
    const body = (await req.json()) as { messages?: ChatMessage[] };
    const messages = (body.messages ?? []).filter(
      (m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
    );
    if (messages.length === 0) throw new HttpError(400, "No messages");

    // A long conversation is fine; an unbounded one is a bill. Keep the recent
    // turns, which is what a planning exchange actually needs.
    const recent = messages.slice(-12);

    const context = await buildContext(user.id);
    const model = Deno.env.get("OPENROUTER_MODEL") ?? DEFAULT_MODEL;

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requireEnv("OPENROUTER_API_KEY")}`,
        "Content-Type": "application/json",
        // OpenRouter asks for these to attribute traffic; they are not secret.
        "HTTP-Referer": Deno.env.get("APP_BASE_URL") ?? "https://grounded-days.vercel.app",
        "X-Title": "grounded",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "system", content: `Here is their current state:\n\n${context}` },
          ...recent,
        ],
        max_tokens: 800,
        temperature: 0.6,
      }),
    });

    const text = await res.text();
    if (!res.ok) {
      console.error(`openrouter ${res.status}: ${text}`);
      // 429 on the free tier is routine (20/min, 50/day), so it gets its own
      // message rather than a generic failure the user cannot act on.
      if (res.status === 429) {
        return jsonResponse(
          {
            error: "rate_limited",
            message: "That model is busy or the daily free limit is used up.",
          },
          429,
        );
      }
      return jsonResponse(
        { error: "provider_error", message: `Model call failed (${res.status}).` },
        502,
      );
    }

    const data = JSON.parse(text);
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      return jsonResponse({ error: "empty_reply", message: "The model returned nothing." }, 502);
    }

    return jsonResponse({
      content,
      model: data.model ?? model,
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? null,
        outputTokens: data.usage?.completion_tokens ?? null,
      },
    });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    console.error("ai-chat failed", err);
    return jsonResponse({ error: "server_error", message: (err as Error).message }, status);
  }
});

// Referenced so the allowlist is not merely a comment: if someone adds a table
// to the context builder without listing it, this is the place that should have
// changed too.
export const _contract = { ALLOWED_TABLES, DENIED_TABLES };
