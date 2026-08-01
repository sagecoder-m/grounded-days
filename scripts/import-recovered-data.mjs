/**
 * One-time import of a recovered grounded_state blob into the relational tables.
 *
 * This is the Node counterpart of src/lib/db/migrate-local.ts: same transform,
 * same fallbacks, same old-id -> UUID resolution as the SQL data migration in
 * supabase/migrations/20260731090100_migrate_grounded_state_blob.sql. The
 * difference is only the source (a JSON file) and the destination credentials.
 *
 * grounded_state is never read or written here.
 *
 * Usage:
 *   node scripts/import-recovered-data.mjs --verify
 *   node scripts/import-recovered-data.mjs --dry-run --file=/path/to/blob.json
 *   node scripts/import-recovered-data.mjs --file=/path/to/blob.json
 *
 * Auth, in order of preference:
 *   1. SUPABASE_SERVICE_ROLE_KEY + GROUNDED_USER_ID  (bypasses RLS)
 *   2. GROUNDED_EMAIL + GROUNDED_PASSWORD            (inserts under RLS)
 *   3. interactive prompt for email + password        (when stdin is a TTY)
 *
 * Flags:
 *   --verify    sign in and report what is in the account; write nothing.
 *               Needs no source file, so it keeps working after the recovered
 *               blob has been archived out of the repo.
 *   --dry-run   transform and print a summary; touch no network
 *   --file=P    source blob (default: recovered-data.json, which is NOT in the
 *               repo -- the recovered copy lives outside it, so pass --file)
 *   --force     import even if the account already has rows (may duplicate)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(import.meta.dirname, "..");

const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(`--${name}`);
const flagValue = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const DRY_RUN = hasFlag("dry-run");
const VERIFY = hasFlag("verify");
const FORCE = hasFlag("force");
const SOURCE = path.resolve(ROOT, flagValue("file") ?? "recovered-data.json");

const die = (msg) => {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
};

// ------------------------------------------------------------------- env / .env

/** Minimal .env reader: KEY=value, # comments, optional surrounding quotes. */
function readDotEnv(file) {
  let raw;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return {};
  }
  const out = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return out;
}

// Real environment wins over .env, so a one-off override needs no file edit.
const dotenv = readDotEnv(path.join(ROOT, ".env"));
const env = (key) => process.env[key] || dotenv[key] || "";

// --------------------------------------------------------------- transform bits
// Deliberately identical to migrate-local.ts.

const str = (v) => (typeof v === "string" && v ? v : null);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const AREAS = ["personal", "professional", "education"];
const area = (v, fallback) => (typeof v === "string" && AREAS.includes(v) ? v : fallback);
const iso = (v) => {
  const ms = num(v);
  return ms === null ? null : new Date(ms).toISOString();
};
const arr = (v) => (Array.isArray(v) ? v : []);
const asRecord = (v) => (typeof v === "object" && v !== null && !Array.isArray(v) ? v : null);

/**
 * Blob -> { tables: [[name, rows]], settingsRow, warnings }.
 * Pure: no network, no clock beyond the createdAt fallbacks.
 */
function buildRows(blob, userId) {
  const warnings = [];

  // Old ids are short random strings; the maps carry them to real UUIDs so the
  // projectId / subprojectId references survive.
  const projectIds = new Map();
  const subprojectIds = new Map();

  const projectRows = [];
  const subprojectRows = [];
  for (const raw of arr(blob.projects)) {
    const p = asRecord(raw);
    const oldId = str(p?.id);
    if (!p || !oldId) {
      warnings.push("skipped a project with no id");
      continue;
    }
    const id = crypto.randomUUID();
    projectIds.set(oldId, id);
    const status = ["active", "paused", "done"].includes(String(p.status))
      ? String(p.status)
      : "active";
    projectRows.push({
      id,
      user_id: userId,
      name: str(p.name) ?? "Untitled project",
      description: str(p.description),
      status,
    });
    for (const rawSub of arr(p.subprojects)) {
      const s = asRecord(rawSub);
      const oldSubId = str(s?.id);
      if (!s || !oldSubId) {
        warnings.push(`skipped a sub-project with no id under "${str(p.name) ?? oldId}"`);
        continue;
      }
      const subId = crypto.randomUUID();
      subprojectIds.set(oldSubId, subId);
      subprojectRows.push({
        id: subId,
        user_id: userId,
        project_id: id,
        name: str(s.name) ?? "Untitled sub-project",
        description: str(s.description),
      });
    }
  }

  const habitRows = [];
  const habitLogRows = [];
  for (const raw of arr(blob.habits)) {
    const h = asRecord(raw);
    const oldId = str(h?.id);
    if (!h || !oldId) {
      warnings.push("skipped a habit with no id");
      continue;
    }
    const id = crypto.randomUUID();
    habitRows.push({
      id,
      user_id: userId,
      name: str(h.name) ?? "Untitled habit",
      created_at: iso(h.createdAt) ?? new Date().toISOString(),
    });
    const log = asRecord(h.log) ?? {};
    const seen = new Set();
    for (const [date, done] of Object.entries(log)) {
      // Explicit `false` means "toggled off" and must not become a row.
      if (done !== true) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        warnings.push(`dropped malformed habit log date "${date}"`);
        continue;
      }
      // (habit_id, date) is UNIQUE; the blob shouldn't repeat a key, but a
      // duplicate here would fail the whole batch insert.
      if (seen.has(date)) continue;
      seen.add(date);
      habitLogRows.push({ user_id: userId, habit_id: id, date });
    }
  }

  const taskRows = arr(blob.tasks).flatMap((raw) => {
    const t = asRecord(raw);
    if (!t) return [];
    const projectId = projectIds.get(str(t.projectId) ?? "") ?? null;
    if (str(t.projectId) && !projectId) {
      warnings.push(`task "${str(t.title) ?? "?"}" referenced unknown project ${t.projectId}`);
    }
    // Gated on the project resolving, so a task can never point at a
    // sub-project belonging to a different project.
    const subprojectId = projectId ? (subprojectIds.get(str(t.subprojectId) ?? "") ?? null) : null;
    return [
      {
        user_id: userId,
        area: area(t.area, "personal"),
        title: str(t.title) ?? "Untitled task",
        description: str(t.description),
        date: str(t.date),
        done: t.done === true,
        project_id: projectId,
        subproject_id: subprojectId,
        created_at: iso(t.createdAt) ?? new Date().toISOString(),
      },
    ];
  });

  const goalRows = arr(blob.goals).flatMap((raw) => {
    const g = asRecord(raw);
    if (!g) return [];
    const projectId = projectIds.get(str(g.projectId) ?? "") ?? null;
    if (str(g.projectId) && !projectId) {
      warnings.push(`goal "${str(g.name) ?? "?"}" referenced unknown project ${g.projectId}`);
    }
    const subprojectId = projectId ? (subprojectIds.get(str(g.subprojectId) ?? "") ?? null) : null;
    return [
      {
        user_id: userId,
        area: area(g.area, "personal"),
        name: str(g.name) ?? "Untitled goal",
        description: str(g.description),
        progress: Math.min(Math.max(Math.round(num(g.progress) ?? 0), 0), 100),
        project_id: projectId,
        subproject_id: subprojectId,
      },
    ];
  });

  const eventRows = arr(blob.events).flatMap((raw) => {
    const e = asRecord(raw);
    const date = str(e?.date);
    if (!e || !date) {
      if (e) warnings.push(`skipped event "${str(e.title) ?? "?"}" with no date`);
      return [];
    }
    // events.area is nullable, so an unrecognised area becomes NULL, not
    // 'personal' — matching the SQL migration.
    return [{ user_id: userId, title: str(e.title) ?? "Untitled event", date, area: area(e.area, null) }];
  });

  const focusRows = arr(blob.focusSessions).flatMap((raw) => {
    const f = asRecord(raw);
    if (!f) return [];
    return [
      {
        user_id: userId,
        label: str(f.label) ?? "Focus session",
        minutes: Math.max(Math.round(num(f.minutes) ?? 25), 1),
        completed_at: iso(f.completedAt) ?? new Date().toISOString(),
      },
    ];
  });

  const s = asRecord(blob.settings) ?? {};
  const settingsRow = {
    user_id: userId,
    display_name: str(s.displayName) ?? "friend",
    density: ["compact", "comfy"].includes(String(s.density)) ? String(s.density) : "comfy",
    accent: ["sage", "clay", "brown", "tan"].includes(String(s.accent)) ? String(s.accent) : "sage",
    default_cal_view: ["week", "month", "year"].includes(String(s.defaultCalView))
      ? String(s.defaultCalView)
      : "week",
    // Omitted when absent/empty so the column DEFAULT supplies the widget list.
    ...(Array.isArray(s.widgets) && s.widgets.length > 0 ? { widgets: s.widgets } : {}),
  };

  // Parents before children so the FKs resolve.
  const tables = [
    ["projects", projectRows],
    ["subprojects", subprojectRows],
    ["habits", habitRows],
    ["habit_logs", habitLogRows],
    ["tasks", taskRows],
    ["goals", goalRows],
    ["events", eventRows],
    ["focus_sessions", focusRows],
  ];

  return { tables, settingsRow, warnings };
}

// ------------------------------------------------------------- supabase client

/**
 * New-style keys (sb_publishable_ / sb_secret_) are opaque strings, not JWTs,
 * and must not be sent as `Authorization: Bearer`. Mirrors the same shim in
 * src/integrations/supabase/client.ts so this script authenticates exactly the
 * way the app does.
 */
const isNewApiKey = (value) =>
  value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");

function clientFor(url, key) {
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  if (isNewApiKey(key)) {
    options.global = {
      fetch: (input, init) => {
        const headers = new Headers(
          typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
        );
        if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
        if (headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    };
  }
  return createClient(url, key, options);
}

// -------------------------------------------------------------------- prompting

/**
 * Read one line from the TTY, echoing characters only when not hidden.
 *
 * Raw mode rather than readline: two sequential readline interfaces on the same
 * stdin leave the stream paused after the first close, so the second prompt
 * hangs forever. Reading bytes directly keeps both prompts on one code path,
 * and makes "don't echo the password" a property of this function rather than
 * a monkey-patch on readline internals.
 */
function prompt(question, { hidden = false } = {}) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    process.stdout.write(question);

    const wasRaw = Boolean(stdin.isRaw);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let buf = "";
    const done = (fn, arg) => {
      stdin.removeListener("data", onData);
      stdin.setRawMode(wasRaw);
      stdin.pause();
      process.stdout.write("\n");
      fn(arg);
    };

    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return done(resolve, buf);
        if (ch === "\u0003") return done(reject, new Error("Cancelled.")); // ctrl-c
        if (ch === "\u0004") return done(resolve, buf); // ctrl-d
        if (ch === "\u007f" || ch === "\b") {
          // Backspace: rub out one character, and one echoed column if visible.
          if (buf.length > 0) {
            buf = buf.slice(0, -1);
            if (!hidden) process.stdout.write("\b \b");
          }
          continue;
        }
        // Ignore other control characters (arrows arrive as escape sequences).
        if (ch < " ") continue;
        buf += ch;
        if (!hidden) process.stdout.write(ch);
      }
    };

    stdin.on("data", onData);
  });
}

// ------------------------------------------------------------------------- main

// --verify only reads the account, so it must not require the source blob --
// that file is archived outside the repo and normally will not be present.
let blob = null;
if (!VERIFY) {
  const blobRaw = (() => {
    try {
      return readFileSync(SOURCE, "utf8");
    } catch (err) {
      die(
        `Could not read ${SOURCE}: ${err.message}\n` +
          "  The recovered blob is not kept in the repo. Pass --file=/path/to/blob.json,\n" +
          "  or use --verify to check the account without a source file.",
      );
    }
  })();

  try {
    blob = JSON.parse(blobRaw);
  } catch (err) {
    die(`${SOURCE} is not valid JSON: ${err.message}`);
  }
  if (!asRecord(blob)) die(`${SOURCE} must contain a JSON object at the top level.`);
}

// --- dry run: transform against a placeholder id and stop before any network.
// --verify wins if both are passed, since it needs no blob to have been read.
if (DRY_RUN && !VERIFY) {
  const { tables, settingsRow, warnings } = buildRows(blob, "00000000-0000-0000-0000-000000000000");
  console.log(`\nDry run — source: ${path.relative(ROOT, SOURCE)}\n`);
  for (const [table, rows] of tables) console.log(`  ${table.padEnd(16)} ${rows.length}`);
  console.log(`  ${"user_settings".padEnd(16)} 1 (upsert)`);
  console.log(
    `\n  settings: ${settingsRow.display_name} / ${settingsRow.density} / ${settingsRow.accent} / ${settingsRow.default_cal_view}` +
      `, widgets: ${settingsRow.widgets ? `${settingsRow.widgets.length} from blob` : "column default"}`,
  );
  const linked = tables
    .flatMap(([name, rows]) => (name === "tasks" || name === "goals" ? rows : []))
    .filter((r) => r.project_id).length;
  console.log(`  ${linked} task/goal rows linked to a project\n`);
  if (warnings.length) {
    console.log("  warnings:");
    for (const w of warnings) console.log(`    ! ${w}`);
    console.log();
  }
  console.log("Nothing was written. Re-run without --dry-run to import.\n");
  process.exit(0);
}

// --- credentials
const url = env("SUPABASE_URL") || env("VITE_SUPABASE_URL");
if (!url) die("SUPABASE_URL is not set (checked the environment and .env).");

const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
const publishableKey = env("SUPABASE_PUBLISHABLE_KEY") || env("VITE_SUPABASE_PUBLISHABLE_KEY");

let supabase;
let userId;

if (serviceKey) {
  userId = env("GROUNDED_USER_ID");
  if (!userId) die("SUPABASE_SERVICE_ROLE_KEY is set, so GROUNDED_USER_ID is required too.");
  supabase = clientFor(url, serviceKey);
  console.log(`\nAuth: service role, importing for user ${userId}`);
} else {
  if (!publishableKey) die("SUPABASE_PUBLISHABLE_KEY is not set (checked the environment and .env).");
  let email = env("GROUNDED_EMAIL");
  let password = env("GROUNDED_PASSWORD");
  if (!email || !password) {
    if (!process.stdin.isTTY) {
      die(
        "No credentials. Set GROUNDED_EMAIL and GROUNDED_PASSWORD (or SUPABASE_SERVICE_ROLE_KEY\n" +
          "  plus GROUNDED_USER_ID), or run this from an interactive terminal to be prompted.",
      );
    }
    email = email || (await prompt("Email: "));
    password = password || (await prompt("Password: ", { hidden: true }));
  }
  supabase = clientFor(url, publishableKey);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) die(`Sign-in failed: ${error.message}`);
  userId = data.user.id;
  console.log(`\nAuth: signed in as ${data.user.email} (${userId})`);
}

// --- schema check: a clear message beats eight identical insert failures.
const missing = [];
for (const table of [
  "projects",
  "subprojects",
  "tasks",
  "goals",
  "habits",
  "habit_logs",
  "events",
  "focus_sessions",
  "user_settings",
]) {
  const { error } = await supabase.from(table).select("*", { count: "exact", head: true });
  // PGRST205 = table absent from the schema cache; 42P01 = relation missing.
  if (error && (error.code === "PGRST205" || error.code === "42P01")) missing.push(table);
  else if (error) die(`Probing ${table} failed: ${error.message}`);
}
if (missing.length) {
  die(
    `These tables do not exist yet: ${missing.join(", ")}.\n` +
      "  Apply the schema migrations first (supabase/migrations/20260731090000_normalize_relational_schema.sql\n" +
      "  and later), then re-run this import.",
  );
}

// --- verify: report the account's contents and stop. Read-only.
if (VERIFY) {
  console.log("\nAccount contents:");
  let total = 0;
  for (const table of [
    "projects",
    "subprojects",
    "habits",
    "habit_logs",
    "tasks",
    "goals",
    "events",
    "focus_sessions",
  ]) {
    const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
    if (error) die(`Counting ${table} failed: ${error.message}`);
    total += count ?? 0;
    console.log(`  ${table.padEnd(16)} ${count ?? 0}`);
  }
  console.log(`  ${"".padEnd(16)} ${"-".repeat(4)}`);
  console.log(`  ${"total".padEnd(16)} ${total}`);

  const { data: s, error: sErr } = await supabase
    .from("user_settings")
    .select("display_name, density, accent, default_cal_view, widgets")
    .eq("user_id", userId)
    .maybeSingle();
  if (sErr) die(`Reading user_settings failed: ${sErr.message}`);
  console.log(
    s
      ? `\n  settings: ${s.display_name} / ${s.density} / ${s.accent} / ${s.default_cal_view}` +
          `, widgets: ${Array.isArray(s.widgets) ? s.widgets.length : "?"}`
      : "\n  settings: no row for this user",
  );
  console.log("\nRead-only — nothing was written.\n");
  await supabase.auth.signOut().catch(() => {});
  process.exit(0);
}

// --- emptiness guard, mirroring migrate-local.ts. The point is to make a
// second run impossible to silently double up the data.
const counts = {};
for (const table of ["projects", "subprojects", "tasks", "goals", "habits", "events", "focus_sessions"]) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) die(`Counting ${table} failed: ${error.message}`);
  counts[table] = count ?? 0;
}
const existing = Object.entries(counts).filter(([, c]) => c > 0);
if (existing.length && !FORCE) {
  die(
    `This account already has rows: ${existing.map(([t, c]) => `${t}=${c}`).join(", ")}.\n` +
      "  Refusing to import on top of existing data — it would duplicate.\n" +
      "  Clear those rows first, or pass --force if duplicates are genuinely what you want.",
  );
}
if (existing.length) {
  console.log(`! --force: importing on top of ${existing.map(([t, c]) => `${t}=${c}`).join(", ")}`);
}

// --- import
const { tables, settingsRow, warnings } = buildRows(blob, userId);
for (const w of warnings) console.log(`  ! ${w}`);

console.log(`\nImporting ${path.relative(ROOT, SOURCE)}:`);
let written = 0;
for (const [table, rows] of tables) {
  if (rows.length === 0) {
    console.log(`  ${table.padEnd(16)} — nothing to insert`);
    continue;
  }
  const { error } = await supabase.from(table).insert(rows);
  if (error) die(`Inserting ${rows.length} row(s) into ${table} failed: ${error.message}`);
  written += rows.length;
  console.log(`  ${table.padEnd(16)} ${rows.length} inserted`);
}

const { error: settingsError } = await supabase
  .from("user_settings")
  .upsert(settingsRow, { onConflict: "user_id" });
if (settingsError) die(`Upserting user_settings failed: ${settingsError.message}`);
console.log(`  ${"user_settings".padEnd(16)} upserted`);

// --- verify by reading back
console.log("\nVerifying:");
for (const table of [
  "projects",
  "subprojects",
  "tasks",
  "goals",
  "habits",
  "habit_logs",
  "events",
  "focus_sessions",
]) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) die(`Verifying ${table} failed: ${error.message}`);
  console.log(`  ${table.padEnd(16)} ${count ?? 0} row(s)`);
}
const { data: settingsBack, error: settingsBackError } = await supabase
  .from("user_settings")
  .select("display_name, density, accent, default_cal_view, widgets")
  .eq("user_id", userId)
  .maybeSingle();
if (settingsBackError) die(`Verifying user_settings failed: ${settingsBackError.message}`);
console.log(`  user_settings    ${JSON.stringify(settingsBack)}`);

console.log(`\n✓ Imported ${written} rows plus settings. grounded_state was not touched.\n`);
await supabase.auth.signOut().catch(() => {});
