/**
 * Supabase connection details for the browser, committed deliberately.
 *
 * Both values below are public by design. They are compiled into the client
 * bundle on every build, so anyone who opens the app can already read them in
 * devtools — that is true of every Supabase browser app, and `.env.example`
 * says as much: "The publishable key is safe to expose — it ships in the client
 * bundle by design." What protects the data is row-level security, which every
 * table has, not secrecy of these strings.
 *
 * They are committed because supplying them purely through deployment
 * environment variables has failed three times in a row, each time shipping a
 * build that loaded and then threw on first render:
 *
 *   - GitHub Pages: repo variables held the literal text ".env"
 *   - GitHub Pages: a stray leading dot on the publishable key
 *   - Vercel: variables marked "Sensitive", which withholds them from the build
 *
 * Environment variables still win when present (see client.ts), so a different
 * deployment can point at a different project without touching this file. This
 * is the floor, not the override.
 *
 * NEVER add the service role key here. It bypasses row-level security entirely
 * and must exist only in Supabase's own function secrets, never in this repo
 * and never in a client bundle. See client.server.ts, which reads it from the
 * server environment and has no fallback on purpose.
 */

export const PUBLIC_SUPABASE_URL = "https://pbjpypcdiwvxegewxleu.supabase.co";

export const PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_YAPkzwW2eH09Cjhuqw_ziA_UxWTYxdC";
