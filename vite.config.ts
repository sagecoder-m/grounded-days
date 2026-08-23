// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";

/**
 * Report what Supabase config the build can actually see.
 *
 * VITE_* values are inlined at build time, so a build that cannot see them used
 * to produce a bundle that threw on first render — the app loaded, showed
 * "Something felt off", and the real reason appeared only in the browser
 * console. That shipped three times (GitHub Pages twice, Vercel once), each
 * time costing far more to diagnose than reading a build log would have.
 *
 * src/integrations/supabase/public-config.ts now provides a committed fallback,
 * so a missing variable no longer breaks the app. That is exactly why this warns
 * rather than throwing: failing the build would take a deployment that WOULD
 * have worked and leave the previous, broken one serving instead.
 *
 * What remains worth saying out loud is that the fallback is in use, because a
 * deployment meant to point at a different Supabase project will silently point
 * at the default one otherwise. Names only, never values — this lands in public
 * CI logs.
 */
function reportSupabaseEnv(): Plugin {
  const EXPECTED = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"];

  return {
    name: "grounded:report-supabase-env",
    configResolved(config) {
      // Dev runs fine against .env; this is about what CI hands the build.
      if (config.command !== "build") return;

      const visible = Object.keys(config.env)
        .filter((key) => key.startsWith("VITE_"))
        .sort();
      console.log(
        `[env] VITE_* variables visible to this build: ${visible.join(", ") || "(none)"}`,
      );

      const missing = EXPECTED.filter((key) => !config.env[key] && !process.env[key]);
      if (missing.length === 0) return;

      console.warn(
        `[env] WARNING: ${missing.join(", ")} not visible to this build.\n` +
          `[env] Falling back to the committed public config in\n` +
          `[env]   src/integrations/supabase/public-config.ts\n` +
          `[env] The app will work and point at the default Supabase project. If this\n` +
          `[env] deployment was meant to use a different project, set those variables\n` +
          `[env] in your host's settings — and on Vercel make sure they are NOT marked\n` +
          `[env] "Sensitive", since sensitive values are withheld from the build step.`,
      );
    },
  };
}

export default defineConfig({
  plugins: [reportSupabaseEnv()],
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
