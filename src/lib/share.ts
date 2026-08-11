/**
 * Share link creation and reading.
 *
 * The raw token is generated in the browser and only its SHA-256 hash is ever
 * sent to the database, so the token exists in the URL and nowhere else. That
 * means a share link can be displayed to its creator exactly once — there is no
 * way to recover it later, by design.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Area } from "@/lib/store-types";

export interface SharedView {
  label: string | null;
  displayName: string | null;
  areas: Area[];
  tasks: { id: string; title: string; area: Area; date: string | null; done: boolean }[];
  goals: { id: string; name: string; area: Area; progress: number }[];
  events: {
    id: string;
    title: string;
    area: Area | null;
    date: string;
    startsAt: string | null;
    allDay: boolean;
  }[];
  habits: { id: string; name: string }[];
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** 32 bytes of CSPRNG output — the link's only secret. */
function generateToken(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return base64Url(buf);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Absolute URL for a token, correct under the GitHub Pages subpath. */
export function shareUrl(token: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${window.location.origin}${base}/share/?t=${token}`;
}

export const DEFAULT_SHARE_DAYS = 7;

/**
 * Create a link and return its URL. Show it immediately: only the hash is
 * stored, so this is the one and only time the URL can be produced.
 */
export async function createShareLink(options: {
  areas: Area[];
  label?: string;
  expiresInDays?: number | null;
}): Promise<string> {
  if (options.areas.length === 0) {
    throw new Error("Choose at least one area to share");
  }

  const token = generateToken();
  const days = options.expiresInDays === undefined ? DEFAULT_SHARE_DAYS : options.expiresInDays;

  const { data: session } = await supabase.auth.getUser();
  if (!session.user) throw new Error("Not signed in");

  const { error } = await supabase.from("share_links").insert({
    user_id: session.user.id,
    token_hash: await sha256Hex(token),
    label: options.label?.trim() || null,
    areas: options.areas,
    expires_at: days === null ? null : new Date(Date.now() + days * 86_400_000).toISOString(),
  });
  if (error) throw new Error(error.message);

  return shareUrl(token);
}

/**
 * Read a shared view. Deliberately a bare fetch rather than functions.invoke:
 * the viewer has no Supabase session, and invoke would attach an anon key
 * header that this endpoint neither needs nor checks.
 */
export async function fetchSharedView(token: string): Promise<SharedView> {
  const base = import.meta.env.VITE_SUPABASE_URL;
  const res = await fetch(`${base}/functions/v1/share-view?t=${encodeURIComponent(token)}`);
  if (!res.ok) throw new Error("not_found");
  return (await res.json()) as SharedView;
}
