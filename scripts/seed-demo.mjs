#!/usr/bin/env node
/**
 * Creates (or refills) a demo account with realistic sample data.
 *
 * The point is a login you can hand to someone — or drive yourself in front of
 * an audience — without exposing your real habits, goals and calendar. It is a
 * separate auth user, so RLS keeps it entirely apart from your own rows.
 *
 * Needs the service role key, because creating a pre-confirmed user and setting
 * a passcode both bypass RLS. Pass everything through the environment; nothing
 * is stored in this file.
 *
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
 *   DEMO_EMAIL=demo@example.com \
 *   DEMO_PASSWORD=<something-you-can-say-out-loud> \
 *   DEMO_PASSCODE=1234 \
 *   node scripts/seed-demo.mjs
 *
 * Re-running wipes the demo user's rows and reseeds, so the demo always starts
 * from the same place. It never touches any other user.
 */
import { createClient } from "@supabase/supabase-js";

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

const SUPABASE_URL = required("SUPABASE_URL");
const SERVICE_ROLE_KEY = required("SUPABASE_SERVICE_ROLE_KEY");
const DEMO_EMAIL = process.env.DEMO_EMAIL ?? "demo@groundeddays.app";
const DEMO_PASSWORD = required("DEMO_PASSWORD");
// Optional: without it the demo account sets its own passcode on first run,
// which is also a fine thing to show off.
const DEMO_PASSCODE = process.env.DEMO_PASSCODE ?? null;

/**
 * This project is on Supabase's newer API keys (sb_secret_… / sb_publishable_…),
 * which are opaque strings rather than JWTs. supabase-js still sends them as
 * "Authorization: Bearer <key>", which those endpoints reject — so drop that
 * header and let the apikey header carry it, exactly as the app's own clients
 * do. Old-style eyJ… service role keys are untouched and keep working.
 */
function isNewSupabaseApiKey(value) {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function keyAwareFetch(supabaseKey) {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: keyAwareFetch(SERVICE_ROLE_KEY) },
});

const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

/** A timestamp on a given day, in UTC, for timed events. */
const at = (offset, hour, minute = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString();
};

async function findOrCreateUser() {
  // listUsers is paged; the demo account is realistically on page one, but
  // walk pages rather than assume it.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const found = data.users.find((u) => u.email?.toLowerCase() === DEMO_EMAIL.toLowerCase());
    if (found) return { id: found.id, created: false };
    if (data.users.length < 200) break;
  }

  const { data, error } = await db.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    // No inbox exists for this address, so confirm it here or sign-in fails.
    email_confirm: true,
  });
  if (error) throw new Error(`createUser failed: ${error.message}`);
  return { id: data.user.id, created: true };
}

/** Wipe just this user's rows so re-running is idempotent. */
async function clearExisting(userId) {
  // goal_steps and subprojects cascade from their parents; habit_logs from
  // habits. Deleting the parents is enough and avoids ordering mistakes.
  for (const table of [
    "tasks",
    "goals",
    "habits",
    "projects",
    "events",
    "focus_sessions",
    "user_settings",
  ]) {
    const { error } = await db.from(table).delete().eq("user_id", userId);
    if (error) throw new Error(`clearing ${table} failed: ${error.message}`);
  }
}

async function insert(table, rows) {
  if (rows.length === 0) return [];
  const { data, error } = await db.from(table).insert(rows).select("id");
  if (error) throw new Error(`insert into ${table} failed: ${error.message}`);
  return data;
}

async function seed(userId) {
  await insert("user_settings", [
    {
      user_id: userId,
      display_name: "Sam",
      density: "comfy",
      accent: "sage",
      default_cal_view: "week",
    },
  ]);

  // --- habits, with a fortnight of plausible history -----------------------
  const habits = await insert(
    "habits",
    ["Walk outside", "Journal", "Make the bed", "Drink water"].map((name) => ({
      user_id: userId,
      name,
    })),
  );

  const logs = [];
  habits.forEach((habit, index) => {
    for (let back = 0; back < 14; back++) {
      // Deterministic but uneven, so the dots look lived-in rather than perfect.
      // A gentle app should not open on an unbroken wall of green.
      if ((back + index * 3) % 4 === 0) continue;
      logs.push({ user_id: userId, habit_id: habit.id, date: day(-back) });
    }
  });
  await insert("habit_logs", logs);

  // --- goals, with steps ---------------------------------------------------
  const goalSpecs = [
    {
      area: "personal",
      name: "Feel steadier in myself",
      description: "Small, kind things — not a personality transplant.",
      steps: [
        ["Book the first therapy session", true],
        ["Walk three times in a week", true],
        ["Say no to one thing", false],
        ["Write down three wins", false],
      ],
    },
    {
      area: "personal",
      name: "Move my body most days",
      steps: [
        ["Find shoes that do not hurt", true],
        ["Walk 20 minutes, five days", true],
        ["Try one swim", false],
      ],
    },
    {
      area: "professional",
      name: "Ship the NCE milestone",
      steps: [
        ["Scope the work", true],
        ["Draft the plan", true],
        ["Review with the team", true],
        ["Ship it", false],
        ["Write the retro", false],
      ],
    },
    {
      area: "education",
      name: "Start the M.S. well prepared",
      description: "Georgetown, Business Analytics.",
      steps: [
        ["Sort out enrolment", true],
        ["Refresh statistics", false],
        ["Set up a study space", false],
      ],
    },
  ];

  for (const spec of goalSpecs) {
    const [goal] = await insert("goals", [
      {
        user_id: userId,
        area: spec.area,
        name: spec.name,
        description: spec.description ?? null,
        progress: 0,
      },
    ]);
    await insert(
      "goal_steps",
      spec.steps.map(([title, done], position) => ({
        user_id: userId,
        goal_id: goal.id,
        title,
        done,
        position,
      })),
    );
  }

  // --- projects, personal and professional ---------------------------------
  const [movePlace] = await insert("projects", [
    {
      user_id: userId,
      name: "Move to the new flat",
      description: "One box at a time.",
      status: "active",
      area: "personal",
    },
  ]);
  const [progression] = await insert("projects", [
    {
      user_id: userId,
      name: "Progression State",
      description: "Client work.",
      status: "active",
      area: "professional",
    },
  ]);
  await insert("projects", [
    {
      user_id: userId,
      name: "CultivateIQ",
      description: "Parked for now — deliberately, not guiltily.",
      status: "paused",
      area: "professional",
    },
  ]);

  const [nce] = await insert("subprojects", [
    { user_id: userId, project_id: progression.id, name: "NCE", description: null },
  ]);

  // --- tasks ---------------------------------------------------------------
  await insert("tasks", [
    // Today, so the Overview tiles and "a look at today" both have content.
    { user_id: userId, area: "personal", title: "Water the plants", date: day(0), done: false },
    {
      user_id: userId,
      area: "personal",
      title: "Ten minutes of tidying",
      date: day(0),
      done: true,
    },
    { user_id: userId, area: "professional", title: "Reply to Dana", date: day(0), done: false },
    {
      user_id: userId,
      area: "education",
      title: "Read one chapter",
      date: day(0),
      done: false,
    },
    // One gently overdue item, because the empty-state version of this app is
    // not the one worth demoing.
    {
      user_id: userId,
      area: "professional",
      title: "Send the invoice",
      date: day(-2),
      done: false,
    },
    // Filed under projects.
    {
      user_id: userId,
      area: "personal",
      title: "Book the van",
      date: day(3),
      done: false,
      project_id: movePlace.id,
    },
    {
      user_id: userId,
      area: "personal",
      title: "Sort out the kitchen boxes",
      date: day(5),
      done: false,
      project_id: movePlace.id,
    },
    {
      user_id: userId,
      area: "personal",
      title: "Redirect the post",
      date: day(-1),
      done: true,
      project_id: movePlace.id,
    },
    {
      user_id: userId,
      area: "professional",
      title: "Draft the NCE summary",
      date: day(1),
      done: false,
      project_id: progression.id,
      subproject_id: nce.id,
    },
    {
      user_id: userId,
      area: "professional",
      title: "Collect the metrics",
      date: day(-3),
      done: true,
      project_id: progression.id,
      subproject_id: nce.id,
    },
    // Upcoming, for the Upcoming widget.
    { user_id: userId, area: "education", title: "Enrolment deadline", date: day(6), done: false },
    { user_id: userId, area: "personal", title: "Call Mum", date: day(2), done: false },
  ]);

  // --- events --------------------------------------------------------------
  await insert("events", [
    {
      user_id: userId,
      title: "Morning walk",
      date: day(0),
      area: "personal",
      all_day: false,
      starts_at: at(0, 8, 0),
      ends_at: at(0, 8, 30),
      source: "local",
    },
    {
      user_id: userId,
      title: "Team standup",
      date: day(0),
      area: "professional",
      all_day: false,
      starts_at: at(0, 14, 0),
      ends_at: at(0, 14, 15),
      source: "local",
    },
    {
      user_id: userId,
      title: "Dentist",
      date: day(0),
      area: "personal",
      all_day: false,
      starts_at: at(0, 16, 30),
      ends_at: at(0, 17, 15),
      source: "local",
    },
    {
      user_id: userId,
      title: "Rest day",
      date: day(0),
      area: "personal",
      all_day: true,
      source: "local",
    },
    {
      user_id: userId,
      title: "Client review",
      date: day(2),
      area: "professional",
      all_day: false,
      starts_at: at(2, 15, 0),
      ends_at: at(2, 16, 0),
      source: "local",
    },
    {
      user_id: userId,
      title: "Term begins",
      date: day(9),
      area: "education",
      all_day: true,
      source: "local",
    },
  ]);

  // --- a little focus history ---------------------------------------------
  await insert(
    "focus_sessions",
    [
      ["Reading", 25, 1],
      ["Reading", 25, 2],
      ["Deep work", 50, 3],
      ["Notes", 25, 5],
    ].map(([label, minutes, back]) => ({
      user_id: userId,
      label,
      minutes,
      completed_at: at(-back, 10, 0),
    })),
  );
}

async function main() {
  const { id: userId, created } = await findOrCreateUser();
  console.log(`${created ? "Created" : "Found"} demo user ${DEMO_EMAIL} (${userId})`);

  await clearExisting(userId);
  console.log("Cleared previous demo rows");

  await seed(userId);
  console.log("Seeded habits, goals with steps, projects, tasks, events and focus sessions");

  if (DEMO_PASSCODE) {
    // set_passcode() reads auth.uid(), so it has to run as the demo user rather
    // than as the service role — sign in once to get a session for the call.
    const asUser = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: keyAwareFetch(SERVICE_ROLE_KEY) },
    });
    const { data: session, error: signInError } = await asUser.auth.signInWithPassword({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });
    if (signInError || !session.session) {
      console.warn(`Could not set the passcode automatically: ${signInError?.message}`);
    } else {
      const { error } = await asUser.rpc("set_passcode", { new_passcode: DEMO_PASSCODE });
      if (error) console.warn(`set_passcode failed: ${error.message}`);
      else console.log(`Passcode set to ${DEMO_PASSCODE}`);
    }
  }

  console.log(`\nDemo ready. Sign in with ${DEMO_EMAIL}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
