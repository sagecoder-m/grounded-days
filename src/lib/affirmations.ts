/**
 * Short, gentle lines shown one at a time.
 *
 * All original text. Quoting well-known authors would mean quoting copyrighted
 * work, and scripture translations are mostly licensed too — writing these
 * ourselves avoids both problems entirely and keeps the voice consistent with
 * the rest of the app.
 *
 * Rules they follow, so additions stay in keeping:
 *   - no imperatives that imply failure ("just try harder", "stop making excuses")
 *   - no productivity framing; a good day is not a measured day
 *   - faith lines stay non-denominational, so they land for anyone
 *   - short enough to read without deciding to read
 */

export type AffirmationKind = "gratitude" | "faith" | "self";

export interface Affirmation {
  kind: AffirmationKind;
  text: string;
}

export const AFFIRMATIONS: Affirmation[] = [
  // --- gratitude ----------------------------------------------------------
  { kind: "gratitude", text: "Something today went quietly right. It still counts." },
  { kind: "gratitude", text: "Someone would be glad to hear from you. That is worth something." },
  {
    kind: "gratitude",
    text: "You have been kept by small things — warmth, water, a door that locks.",
  },
  {
    kind: "gratitude",
    text: "The ordinary parts of today were doing more work than they looked like.",
  },
  { kind: "gratitude", text: "Notice one thing you did not have to arrange yourself." },

  // --- faith --------------------------------------------------------------
  { kind: "faith", text: "You are held by more than your own effort." },
  { kind: "faith", text: "What you cannot carry today, you are not asked to carry alone." },
  { kind: "faith", text: "Rest is allowed. It was built into the week before you were." },
  { kind: "faith", text: "Grace does not wait for the day to go well." },
  { kind: "faith", text: "You are not behind on becoming who you are." },

  // --- self ---------------------------------------------------------------
  { kind: "self", text: "You are allowed to be a work in progress and worth something already." },
  { kind: "self", text: "A slow day is still a day you were here for." },
  { kind: "self", text: "You are not the sum of what you finished." },
  { kind: "self", text: "Starting again is not starting over." },
  { kind: "self", text: "Being tired is information, not a verdict." },
  { kind: "self", text: "You can do the next small thing. That is the whole requirement." },
  { kind: "self", text: "Whatever you managed today, you were the one who managed it." },
];

/**
 * Pick one line for a given day, stably.
 *
 * Deliberately not random: a line that changes on every render is a flicker, and
 * one that changes on refresh invites refreshing for a better one. The same day
 * gives the same line, and tomorrow gives a different one.
 */
export function affirmationForDate(date: string, kinds?: AffirmationKind[]): Affirmation {
  const pool = kinds?.length ? AFFIRMATIONS.filter((a) => kinds.includes(a.kind)) : AFFIRMATIONS;
  const list = pool.length > 0 ? pool : AFFIRMATIONS;
  // Sum of char codes is plenty for spreading consecutive dates around a list
  // of this size, and needs no dependency.
  let hash = 0;
  for (let i = 0; i < date.length; i++) hash = (hash * 31 + date.charCodeAt(i)) % 100000;
  return list[hash % list.length];
}
