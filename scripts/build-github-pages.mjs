#!/usr/bin/env node
// Builds a fully static export of the app for GitHub Pages.
//
// TanStack Start's own static-export path (tanstackStart spa.enabled +
// Nitro's `static`/`github-pages` presets) currently fails in this project's
// dependency versions — the prerender crawler 404s on "/" and the build then
// errors with "rollupOptions.input should not be an html file when building
// for SSR" (Nitro v3 is still pre-RC). Rather than fight that, this script
// does the same thing by hand:
//   1. Build with the plain Node preset (works today, unlike the static one).
//   2. Boot the built server headlessly and fetch each known route.
//   3. Save each response as `<route>/index.html` alongside the built
//      client assets, so any static file host (GitHub Pages included) can
//      serve the whole app with no server process at runtime.
//
// The app has no server-side data loading — every route renders the same
// way on every request — so "curl each route once at build time" produces
// the exact same HTML a real SSR request would.
import { spawn } from "node:child_process";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = new URL("..", import.meta.url).pathname;
const PORT = 8791;
const BASE = "/grounded-days/";
const ORIGIN = `http://127.0.0.1:${PORT}`;
const OUT_DIR = `${ROOT}dist-pages`;

// Every static route in src/routes (excluding the sitemap.xml server route,
// which public/sitemap.xml replaces for this build).
//
// /share is included so share links resolve as a real static file rather than
// relying on the 404 fallback. Its token travels in the query string, which the
// client reads after hydration, so one prerendered page serves every link.
const ROUTES = [
  "/",
  "/auth",
  "/calendar",
  "/personal",
  "/professional",
  "/education",
  "/profile",
  "/share",
];

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", cwd: ROOT, ...opts });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited with ${code}`)),
    );
    child.on("error", reject);
  });
}

async function waitForServer(url, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return; // server is up and routing
    } catch {
      // not listening yet
    }
    await sleep(200);
  }
  throw new Error(`Server at ${url} did not come up within ${timeoutMs}ms`);
}

async function main() {
  console.log("[1/4] Building (Node preset, base = " + BASE + ")...");
  await rm(`${ROOT}.output`, { recursive: true, force: true });
  await run("bun", ["run", "build"], {
    env: { ...process.env, NITRO_PRESET: "node-server", GH_PAGES_BASE: BASE },
  });

  console.log("[2/4] Booting the built server headlessly...");
  const server = spawn("node", [`${ROOT}.output/server/index.mjs`], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, PORT: String(PORT) },
  });
  const stopServer = () => server.kill();
  process.on("exit", stopServer);

  try {
    await waitForServer(`${ORIGIN}${BASE}`);

    console.log("[3/4] Fetching every route and writing static HTML...");
    await rm(OUT_DIR, { recursive: true, force: true });
    await cp(`${ROOT}.output/public`, OUT_DIR, { recursive: true });

    for (const route of ROUTES) {
      const path = `${BASE}${route.slice(1)}`.replace(/\/+$/, "") || BASE;
      const res = await fetch(`${ORIGIN}${path}`);
      if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
      const html = await res.text();
      const dir = route === "/" ? OUT_DIR : `${OUT_DIR}/${route.slice(1)}`;
      await mkdir(dir, { recursive: true });
      await writeFile(`${dir}/index.html`, html);
      console.log(`      ${path} -> ${dir}/index.html`);
    }

    // GitHub Pages serves this for any path with no matching file — reuse
    // our own not-found page rather than GitHub's generic 404.
    const notFound = await fetch(`${ORIGIN}${BASE}__not-found__`);
    await writeFile(`${OUT_DIR}/404.html`, await notFound.text());
    console.log(`      (404) -> ${OUT_DIR}/404.html`);
  } finally {
    stopServer();
  }

  console.log("[4/4] Writing .nojekyll...");
  await writeFile(`${OUT_DIR}/.nojekyll`, "");

  console.log(`\nStatic export ready at ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
