/**
 * A duplicate of src/lib/affirmations.ts, kept in sync by hand.
 *
 * Every edge function in this codebase imports only from its own tree — a
 * `jsr:` specifier or a relative path under supabase/functions/_shared/ —
 * never from src/. Reaching across that boundary into the frontend's own
 * lib directory would be the first exception to that, and an unverifiable
 * one: this session has no working deploy access, so a cross-directory
 * import that resolves locally but fails the CLI's asset bundler at deploy
 * time would not surface until someone tried it for real. A small,
 * deliberate copy is the safer choice, at the cost of a second file to
 * update if a line is ever added or reworded.
 *
 * The text itself, and the hashing that picks one line for a given day, are
 * copied verbatim — see the original for the rules new lines should follow.
 */

export type AffirmationKind = "gratitude" | "faith" | "self";

export interface Affirmation {
  kind: AffirmationKind;
  text: string;
}

export const AFFIRMATIONS: Affirmation[] = [
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

  { kind: "faith", text: "You are held by more than your own effort." },
  { kind: "faith", text: "What you cannot carry today, you are not asked to carry alone." },
  { kind: "faith", text: "Rest is allowed. It was built into the week before you were." },
  { kind: "faith", text: "Grace does not wait for the day to go well." },
  { kind: "faith", text: "You are not behind on becoming who you are." },

  { kind: "self", text: "You are allowed to be a work in progress and worth something already." },
  { kind: "self", text: "A slow day is still a day you were here for." },
  { kind: "self", text: "You are not the sum of what you finished." },
  { kind: "self", text: "Starting again is not starting over." },
  { kind: "self", text: "Being tired is information, not a verdict." },
  { kind: "self", text: "You can do the next small thing. That is the whole requirement." },
  { kind: "self", text: "Whatever you managed today, you were the one who managed it." },
];

/** Pick one line for a given day, stably — see the original for why this is
 *  a hash of the date rather than random. */
export function affirmationForDate(date: string): Affirmation {
  let hash = 0;
  for (let i = 0; i < date.length; i++) hash = (hash * 31 + date.charCodeAt(i)) % 100000;
  return AFFIRMATIONS[hash % AFFIRMATIONS.length];
}
