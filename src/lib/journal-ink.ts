import { supabase } from "@/integrations/supabase/client";

/**
 * Storing and reading a handwritten journal page.
 *
 * Its own private bucket rather than the assistant's: those two have different
 * lifetimes and very different sensitivity, and an image the assistant was
 * shown on purpose has no business sitting in the same folder as a page of
 * someone's journal. The bucket policies scope every object to the uid in its
 * first path segment — see the migration.
 */
const BUCKET = "journal-ink";

/**
 * Upload a page, replacing the day's previous one.
 *
 * The path is stable per day (`<uid>/<date>.png`) with upsert, so a day never
 * accumulates a trail of abandoned images as it is edited. The trade is that
 * the URL is predictable — which costs nothing here, because the bucket is
 * private and every read goes through a signed URL that only the owner can
 * mint.
 */
export async function uploadInk(userId: string, date: string, blob: Blob): Promise<string> {
  const path = `${userId}/${date}.png`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: "image/png",
    upsert: true,
  });
  if (error) throw error;
  return path;
}

export async function deleteInk(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path]);
}

/**
 * A URL the browser can render, valid for an hour.
 *
 * Signed rather than public, and the hour is deliberate: long enough that a
 * page stays visible while someone reads back a month of entries, short enough
 * that a URL copied out of devtools is not a permanent key to somebody's
 * journal.
 */
export async function signedInkUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
