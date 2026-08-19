// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";

/**
 * Fail the build when the Supabase config is missing, instead of shipping.
 *
 * VITE_* values are inlined at build time, so a build that cannot see them
 * produces a bundle that throws on first render — the app loads, then shows
 * "Something felt off" with the real reason only in the browser console. That
 * has now happened on three separate deploys (GitHub Pages twice, Vercel once),
 * each time costing far more to diagnose than a failed build would have.
 *
 * A deployment that cannot reach its database is worthless, so refusing to
 * build is strictly better than succeeding and serving a broken page.
 *
 * The log line lists names only, never values, and is the fastest way to see
 * what a CI environment is actually passing through.
 */
function requireSupabaseEnv(): Plugin {
  const REQUIRED = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"];

  return {
    name: "grounded:require-supabase-env",
    configResolved(config) {
      // Dev runs fine against .env; this is about what CI hands the build.
      if (config.command !== "build") return;

      const visible = Object.keys(config.env)
        .filter((key) => key.startsWith("VITE_"))
        .sort();
      console.log(
        `[env] VITE_* variables visible to this build: ${visible.join(", ") || "(none)"}`,
      );

      const missing = REQUIRED.filter((key) => !config.env[key] && !process.env[key]);
      if (missing.length === 0) return;

      throw new Error(
        `Missing required build-time environment variable(s): ${missing.join(", ")}.\n` +
          `\n` +
          `These are inlined into the client bundle, so they must be present when the\n` +
          `build runs — not only at runtime. On Vercel, set them in Settings ->\n` +
          `Environment Variables and make sure they are NOT marked "Sensitive",\n` +
          `since sensitive values are withheld from the build step.\n` +
          `\n` +
          `Both values are safe to expose: they ship in the client bundle by design,\n` +
          `and row-level security is what protects the data. Never add the service\n` +
          `role key here.`,
      );
    },
  };
}

export default defineConfig({
  plugins: [requireSupabaseEnv()],
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
