#!/usr/bin/env node
/**
 * Collects the calendar provider credentials and pushes them to Supabase.
 *
 * This exists because editing a dotfile is the step that keeps failing: the
 * editor window opens, the paste lands in whichever window still had keyboard
 * focus, and the file keeps its placeholders. Asking here means the values go
 * straight from clipboard to Terminal to Supabase.
 *
 *   node scripts/set-calendar-secrets.mjs
 *
 * Client IDs are shown as you paste — they are public identifiers in an OAuth
 * flow, and seeing them is how you catch a truncated paste. Client secrets are
 * hidden. Leave a pair blank to skip that provider.
 */
import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const ENV_FILE = new URL("../.env.calendar", import.meta.url).pathname;
const APP_BASE_URL = "https://grounded-days.vercel.app";

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      let muted = false;
      rl._writeToOutput = (chunk) => {
        if (!muted) rl.output.write(chunk);
      };
      rl.question(question, (v) => {
        rl.close();
        process.stdout.write("\n");
        resolve(v.trim());
      });
      muted = true;
    } else {
      rl.question(question, (v) => {
        rl.close();
        resolve(v.trim());
      });
    }
  });
}

/** The CLI was installed to ~/.local/bin, which may not be on PATH here. */
function supabaseBin() {
  const local = `${process.env.HOME}/.local/bin/supabase`;
  return existsSync(local) ? local : "supabase";
}

function run(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: "inherit",
      cwd: new URL("..", import.meta.url).pathname,
    });
    child.on("exit", (code) => resolve(code));
    child.on("error", () => resolve(1));
  });
}

/** Placeholders and obvious mis-pastes are worth catching before Supabase does. */
function looksUnset(value) {
  return !value || value.startsWith("paste-");
}

if (!process.stdin.isTTY) {
  console.error("This script needs a terminal to ask questions on.");
  process.exit(1);
}

console.log("Calendar credentials. Press Enter to skip a provider.\n");

console.log("--- Outlook / Microsoft ---");
console.log("Azure -> your app -> Overview -> Application (client) ID");
const msId = await ask("  MICROSOFT_CLIENT_ID: ");
let msSecret = "";
if (!looksUnset(msId)) {
  console.log("Azure -> Certificates & secrets -> the Value column (hidden as you paste)");
  msSecret = await ask("  MICROSOFT_CLIENT_SECRET: ", { hidden: true });
  if (looksUnset(msSecret)) {
    console.error("A client ID with no secret cannot authenticate. Nothing was saved.");
    process.exit(1);
  }
  // Azure secret IDs are UUIDs; the Value is a longer opaque string. Pasting
  // the wrong column is the single easiest mistake to make on that screen.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(msSecret)) {
    console.error("\nThat looks like the Secret ID, not the secret Value.");
    console.error("On the Certificates & secrets page, copy the 'Value' column.");
    process.exit(1);
  }
}

console.log("\n--- Google Calendar ---");
console.log("Google Cloud -> APIs & Services -> Credentials -> your OAuth client");
const gId = await ask("  GOOGLE_CLIENT_ID: ");
let gSecret = "";
if (!looksUnset(gId)) {
  gSecret = await ask("  GOOGLE_CLIENT_SECRET (hidden): ", { hidden: true });
  if (looksUnset(gSecret)) {
    console.error("A client ID with no secret cannot authenticate. Nothing was saved.");
    process.exit(1);
  }
}

if (looksUnset(msId) && looksUnset(gId)) {
  console.error("\nNothing entered — nothing was changed.");
  process.exit(1);
}

const lines = [
  "# Written by scripts/set-calendar-secrets.mjs. Gitignored.",
  `APP_BASE_URL=${APP_BASE_URL}`,
];
if (!looksUnset(msId)) {
  lines.push(`MICROSOFT_CLIENT_ID=${msId}`, `MICROSOFT_CLIENT_SECRET=${msSecret}`);
}
if (!looksUnset(gId)) {
  lines.push(`GOOGLE_CLIENT_ID=${gId}`, `GOOGLE_CLIENT_SECRET=${gSecret}`);
}
writeFileSync(ENV_FILE, lines.join("\n") + "\n", { mode: 0o600 });
console.log(`\nWrote ${lines.length - 1} values to .env.calendar`);

console.log("Pushing to Supabase...\n");
const code = await run(supabaseBin(), ["secrets", "set", "--env-file", ENV_FILE]);
if (code !== 0) {
  console.error("\nsupabase secrets set failed. The values are saved in .env.calendar,");
  console.error("so nothing needs re-typing — the push can be retried.");
  process.exit(code);
}
console.log("\nDone. Connect a calendar from Profile.");
