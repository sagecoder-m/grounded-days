import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * A config of its own, deliberately not the app's.
 *
 * vite.config.ts goes through @lovable.dev/vite-tanstack-config, which bundles
 * TanStack Start, nitro and a build target — none of which a unit test needs,
 * and Start in particular expects a server environment and a route tree that a
 * test run has no reason to build. Reusing it means every test pays for the
 * whole application build and breaks whenever that build changes.
 *
 * So this is the minimum a test needs: JSX, and the @ alias the source uses.
 */
export default defineConfig({
  plugins: [react()],
  // Vite resolves tsconfig paths itself now, which is where the @ alias comes
  // from. The vite-tsconfig-paths plugin does the same thing and says so on
  // every run.
  resolve: { tsconfigPaths: true },
  test: {
    /*
      jsdom, not node, so a component test can render.

      Most of what is worth testing here is pure — the analytics in
      src/lib/hq-analytics.ts, the schedule helpers — and would run in node. But
      the parts most likely to break silently are the ones with a DOM (a control
      that is invisible and unclickable, a description that clamps the editor
      instead of the preview), and having to reconfigure before writing that
      first test is how a suite stays theoretical.
    */
    environment: "jsdom",
    // jsdom defaults to about:blank, an opaque origin, which is not what any
    // page the app runs on has. A real one keeps URL resolution and the storage
    // APIs behaving the way they do in a browser.
    environmentOptions: { jsdom: { url: "http://localhost/" } },
    // See the file: Node's own disabled localStorage otherwise shadows jsdom's.
    setupFiles: ["src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // The app's own output and the Supabase functions, which run on Deno and
    // have their own imports.
    exclude: ["node_modules", ".output", ".nitro", "supabase/functions/**"],
    // Rendered components leave their DOM behind otherwise, and the next test's
    // queries then match the previous test's markup.
    restoreMocks: true,
    globals: false,
  },
});
