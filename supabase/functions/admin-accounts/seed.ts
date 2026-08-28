// Sample data for the demo account.
//
// A demo of a planner with nothing in it demonstrates nothing: every page shows
// its empty state, every chart says "not enough yet", and the thing you are
// trying to show — what a fortnight of real use looks like — is exactly what is
// missing. This fills one account with a plausible fortnight so every section
// has something to say.
//
// Server-side and service-role, because it writes rows belonging to a user who
// is not the caller. Admin-only, like everything else in this function.
//
// Deliberately deterministic. Dates are computed from today so the data never
// goes stale, but the content is fixed: a demo that reshuffles itself between
// showings is one you cannot rehearse against.
//
// Everything in here is invented. No real names, no real institutions, and
// nothing that could be mistaken for one person's actual life.
import { serviceClient } from "../_shared/supabase.ts";

/** yyyy-mm-dd, n days from today. Negative is the past. */
function day(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** An ISO instant at a given hour on a given day offset. */
function at(offset: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

const id = () => crypto.randomUUID();

/**
 * The moods the database will accept.
 *
 * Typed rather than left as free strings: the first version of this file used
 * "okay", which is not one of them, and the CHECK constraint rejected the whole
 * journal insert — halfway through a seed that had already written projects and
 * tasks, leaving the account partly filled and no obvious reason why. A union
 * turns that into a red squiggle.
 */
type Mood = "low" | "tender" | "steady" | "good" | "wired";
const mood = (m: Mood) => m;

/**
 * Clear this account's content, then write the sample set.
 *
 * Clearing first so the command is repeatable — running it twice should leave
 * the same demo, not two of everything. It only touches the tables listed here,
 * all of which are content: the account itself, its settings and its passcode
 * are left alone, so re-seeding never changes how anyone signs in.
 */
const CONTENT_TABLES = [
  "habit_logs",
  "goal_steps",
  "focus_sessions",
  "journal_entries",
  "tasks",
  "habits",
  "goals",
  "subprojects",
  "projects",
  "courses",
  "events",
] as const;

export async function seedDemoData(userId: string): Promise<Record<string, number>> {
  const db = serviceClient();

  for (const table of CONTENT_TABLES) {
    const { error } = await db.from(table).delete().eq("user_id", userId);
    // Events include synced rows the client may not delete, but the service
    // role may; a failure here would leave a half-cleared account, so it stops.
    if (error) throw new Error(`Could not clear ${table}: ${error.message}`);
  }

  const counts: Record<string, number> = {};
  const insert = async (table: string, rows: Record<string, unknown>[]) => {
    if (rows.length === 0) return;
    const { error } = await db.from(table).insert(rows);
    if (error) throw new Error(`Could not seed ${table}: ${error.message}`);
    counts[table] = (counts[table] ?? 0) + rows.length;
  };

  // ---- Personal: habits that feed goals, and goals with steps -------------

  const goalSteadier = id();
  const goalMove = id();
  const goalHome = id();

  await insert("goals", [
    {
      id: goalSteadier,
      user_id: userId,
      area: "personal",
      name: "Feel steadier in the mornings",
      description: "Small, kind things — not a personality transplant.",
      progress: 50,
      position: 0,
      target_date: day(38),
    },
    {
      id: goalMove,
      user_id: userId,
      area: "personal",
      name: "Move my body most days",
      description: "Walking counts. It mostly is walking.",
      progress: 67,
      position: 1,
    },
    {
      id: goalHome,
      user_id: userId,
      area: "personal",
      name: "Make the flat feel like mine",
      progress: 25,
      position: 2,
    },
  ]);

  await insert("goal_steps", [
    {
      id: id(),
      user_id: userId,
      goal_id: goalSteadier,
      title: "Put the phone in the hall at night",
      done: true,
      position: 0,
    },
    {
      id: id(),
      user_id: userId,
      goal_id: goalSteadier,
      title: "One glass of water before coffee",
      done: true,
      position: 1,
    },
    {
      id: id(),
      user_id: userId,
      goal_id: goalSteadier,
      title: "Get up at the first alarm twice this week",
      done: false,
      position: 2,
    },
    {
      id: id(),
      user_id: userId,
      goal_id: goalSteadier,
      title: "Write down three wins on Sunday",
      done: false,
      position: 3,
    },
    {
      id: id(),
      user_id: userId,
      goal_id: goalMove,
      title: "Find shoes that do not hurt",
      done: true,
      position: 0,
    },
    {
      id: id(),
      user_id: userId,
      goal_id: goalMove,
      title: "Walk twenty minutes after lunch",
      done: true,
      position: 1,
    },
    {
      id: id(),
      user_id: userId,
      goal_id: goalMove,
      title: "Swim once, badly, without apologising",
      done: false,
      position: 2,
    },
    {
      id: id(),
      user_id: userId,
      goal_id: goalHome,
      title: "Hang the two pictures",
      done: true,
      position: 0,
    },
    {
      id: id(),
      user_id: userId,
      goal_id: goalHome,
      title: "Get a lamp for the corner",
      done: false,
      position: 1,
    },
    {
      id: id(),
      user_id: userId,
      goal_id: goalHome,
      title: "Clear the chair that collects clothes",
      done: false,
      position: 2,
    },
    {
      id: id(),
      user_id: userId,
      goal_id: goalHome,
      title: "Buy one plant that is hard to kill",
      done: false,
      position: 3,
    },
  ]);

  // Two of the four serve a goal, which is the point being demonstrated: the
  // link is optional and most habits stand on their own.
  const habitWalk = id();
  const habitWater = id();
  const habitJournal = id();
  const habitBed = id();

  await insert("habits", [
    { id: habitWalk, user_id: userId, name: "Walk outside", position: 0, goal_id: goalMove },
    { id: habitWater, user_id: userId, name: "Drink water", position: 1 },
    { id: habitJournal, user_id: userId, name: "Journal", position: 2, goal_id: goalSteadier },
    { id: habitBed, user_id: userId, name: "Make the bed", position: 3 },
  ]);

  /**
   * A fortnight of logs, patchy on purpose.
   *
   * A demo where every habit is ticked every day is the one thing this app
   * argues against, and it makes the charts a flat line. These are irregular,
   * with a visible gap around a week ago, because the interesting thing to
   * demonstrate is that a gap is not treated as a failure.
   */
  const logPattern: Record<string, number[]> = {
    [habitWalk]: [-13, -12, -11, -9, -8, -6, -5, -4, -2, -1, 0],
    [habitWater]: [-13, -12, -11, -10, -9, -4, -3, -2, -1, 0],
    [habitJournal]: [-13, -11, -10, -5, -3, -1, 0],
    [habitBed]: [-12, -11, -10, -9, -8, -4, -3, -2, 0],
  };
  await insert(
    "habit_logs",
    Object.entries(logPattern).flatMap(([habitId, offsets]) =>
      offsets.map((o) => ({ id: id(), user_id: userId, habit_id: habitId, date: day(o) })),
    ),
  );

  // ---- Professional: a project with sub-projects, goals and tasks ---------

  const projOnboarding = id();
  const projSite = id();
  const projQuarter = id();
  const subPaperwork = id();
  const subKickoff = id();
  const subHandover = id();
  const subCopy = id();

  await insert("projects", [
    {
      id: projOnboarding,
      user_id: userId,
      area: "professional",
      name: "Client onboarding",
      description: "The new intake flow, end to end.",
      status: "active",
      position: 0,
    },
    {
      id: projSite,
      user_id: userId,
      area: "professional",
      name: "Website refresh",
      description: "Copy first, then design, then build.",
      status: "active",
      position: 1,
    },
    {
      id: projQuarter,
      user_id: userId,
      area: "professional",
      name: "Quarter close",
      description: "Parked until the month turns — deliberately, not guiltily.",
      status: "paused",
      position: 2,
    },
  ]);

  await insert("subprojects", [
    { id: subPaperwork, user_id: userId, project_id: projOnboarding, name: "Paperwork" },
    { id: subKickoff, user_id: userId, project_id: projOnboarding, name: "Kickoff call" },
    { id: subHandover, user_id: userId, project_id: projOnboarding, name: "Handover" },
    { id: subCopy, user_id: userId, project_id: projSite, name: "Copy" },
  ]);

  const goalWelcome = id();
  const goalSignatures = id();
  const goalAgenda = id();
  const goalHomepage = id();

  await insert("goals", [
    {
      id: goalWelcome,
      user_id: userId,
      area: "professional",
      name: "Draft the welcome pack",
      description: "Everything a new client gets in week one.",
      progress: 60,
      position: 0,
      project_id: projOnboarding,
      subproject_id: subPaperwork,
      target_date: day(9),
    },
    {
      id: goalSignatures,
      user_id: userId,
      area: "professional",
      name: "Get the agreement signed",
      progress: 20,
      position: 1,
      project_id: projOnboarding,
      subproject_id: subPaperwork,
    },
    {
      id: goalAgenda,
      user_id: userId,
      area: "professional",
      name: "Agree the kickoff agenda",
      progress: 100,
      position: 2,
      project_id: projOnboarding,
      subproject_id: subKickoff,
    },
    {
      id: goalHomepage,
      user_id: userId,
      area: "professional",
      name: "Rewrite the homepage",
      progress: 40,
      position: 3,
      project_id: projSite,
      subproject_id: subCopy,
      target_date: day(21),
    },
  ]);

  await insert("goal_steps", [
    {
      id: id(),
      user_id: userId,
      goal_id: goalWelcome,
      title: "Outline the sections",
      done: true,
      position: 0,
    },
    {
      id: id(),
      user_id: userId,
      goal_id: goalWelcome,
      title: "Write the introduction",
      done: true,
      position: 1,
    },
    {
      id: id(),
      user_id: userId,
      goal_id: goalWelcome,
      title: "Add the pricing page",
      done: false,
      position: 2,
    },
    {
      id: id(),
      user_id: userId,
      goal_id: goalWelcome,
      title: "Ask someone to read it back",
      done: false,
      position: 3,
    },
    {
      id: id(),
      user_id: userId,
      goal_id: goalSignatures,
      title: "Send the agreement",
      done: true,
      position: 0,
    },
    {
      id: id(),
      user_id: userId,
      goal_id: goalSignatures,
      title: "Chase it once, kindly",
      done: false,
      position: 1,
    },
    { id: id(), user_id: userId, goal_id: goalAgenda, title: "Draft it", done: true, position: 0 },
    {
      id: id(),
      user_id: userId,
      goal_id: goalAgenda,
      title: "Send it round",
      done: true,
      position: 1,
    },
    {
      id: id(),
      user_id: userId,
      goal_id: goalHomepage,
      title: "Cut it in half",
      done: true,
      position: 0,
    },
    {
      id: id(),
      user_id: userId,
      goal_id: goalHomepage,
      title: "Say what we actually do",
      done: false,
      position: 1,
    },
    {
      id: id(),
      user_id: userId,
      goal_id: goalHomepage,
      title: "One call to action, not four",
      done: false,
      position: 2,
    },
  ]);

  // ---- Education: courses and their assignments --------------------------

  const courseStats = id();
  const courseWriting = id();
  const courseEthics = id();

  await insert("courses", [
    {
      id: courseStats,
      user_id: userId,
      name: "Statistics",
      code: "STA 210",
      term: "Autumn",
      position: 0,
    },
    {
      id: courseWriting,
      user_id: userId,
      name: "Academic writing",
      code: "ENG 105",
      term: "Autumn",
      position: 1,
    },
    { id: courseEthics, user_id: userId, name: "Research ethics", term: "Autumn", position: 2 },
  ]);

  const goalPass = id();
  const goalReading = id();
  await insert("goals", [
    {
      id: goalPass,
      user_id: userId,
      area: "education",
      name: "Get through the stats module without panicking",
      description: "Steady beats clever.",
      progress: 45,
      position: 0,
      target_date: day(46),
    },
    {
      id: goalReading,
      user_id: userId,
      area: "education",
      name: "Read something every weekday",
      progress: 30,
      position: 1,
    },
  ]);
  await insert("goal_steps", [
    {
      id: id(),
      user_id: userId,
      goal_id: goalPass,
      title: "Redo the week two problems",
      done: true,
      position: 0,
    },
    {
      id: id(),
      user_id: userId,
      goal_id: goalPass,
      title: "Book one office hour",
      done: false,
      position: 1,
    },
    {
      id: id(),
      user_id: userId,
      goal_id: goalPass,
      title: "Find a study partner",
      done: false,
      position: 2,
    },
    {
      id: id(),
      user_id: userId,
      goal_id: goalReading,
      title: "Twenty minutes, not two hours",
      done: true,
      position: 0,
    },
    {
      id: id(),
      user_id: userId,
      goal_id: goalReading,
      title: "Keep a list of what stuck",
      done: false,
      position: 1,
    },
  ]);

  // ---- Tasks across all three areas, past and future ---------------------

  await insert("tasks", [
    // Personal, loose
    {
      id: id(),
      user_id: userId,
      area: "personal",
      title: "Book the dentist",
      done: false,
      date: day(0),
    },
    {
      id: id(),
      user_id: userId,
      area: "personal",
      title: "Reply to Sam about the weekend",
      done: false,
      date: day(-3),
    },
    {
      id: id(),
      user_id: userId,
      area: "personal",
      title: "Water the plants",
      done: true,
      date: day(-1),
    },
    {
      id: id(),
      user_id: userId,
      area: "personal",
      title: "Return the parcel",
      done: true,
      date: day(-4),
    },
    {
      id: id(),
      user_id: userId,
      area: "personal",
      title: "Sort out the kitchen boxes",
      done: false,
      date: day(2),
    },
    { id: id(), user_id: userId, area: "personal", title: "Ring Mum", done: true, date: day(-6) },
    { id: id(), user_id: userId, area: "personal", title: "Find the passport", done: false },

    // Professional, filed under the project structure
    {
      id: id(),
      user_id: userId,
      area: "professional",
      title: "Chase the signed form",
      done: false,
      date: day(0),
      project_id: projOnboarding,
      subproject_id: subPaperwork,
    },
    {
      id: id(),
      user_id: userId,
      area: "professional",
      title: "Book the meeting room",
      done: true,
      date: day(-2),
      project_id: projOnboarding,
      subproject_id: subKickoff,
    },
    {
      id: id(),
      user_id: userId,
      area: "professional",
      title: "Send the handover notes",
      done: false,
      date: day(4),
      project_id: projOnboarding,
      subproject_id: subHandover,
    },
    {
      id: id(),
      user_id: userId,
      area: "professional",
      title: "Collect the old copy",
      done: true,
      date: day(-5),
      project_id: projSite,
      subproject_id: subCopy,
    },
    {
      id: id(),
      user_id: userId,
      area: "professional",
      title: "Invoice for August",
      done: false,
      date: day(1),
    },

    // Education, filed under courses
    {
      id: id(),
      user_id: userId,
      area: "education",
      title: "Problem set 3",
      done: false,
      date: day(1),
      course_id: courseStats,
    },
    {
      id: id(),
      user_id: userId,
      area: "education",
      title: "Read chapter 4",
      done: false,
      date: day(0),
      course_id: courseStats,
    },
    {
      id: id(),
      user_id: userId,
      area: "education",
      title: "Draft the literature review",
      done: false,
      date: day(5),
      course_id: courseWriting,
    },
    {
      id: id(),
      user_id: userId,
      area: "education",
      title: "Ethics module quiz",
      done: false,
      date: day(3),
      course_id: courseEthics,
    },
    {
      id: id(),
      user_id: userId,
      area: "education",
      title: "Problem set 2",
      done: true,
      date: day(-6),
      course_id: courseStats,
    },
    {
      id: id(),
      user_id: userId,
      area: "education",
      title: "Reading response 1",
      done: true,
      date: day(-9),
      course_id: courseWriting,
    },
  ]);

  // ---- Calendar ----------------------------------------------------------

  await insert("events", [
    {
      id: id(),
      user_id: userId,
      title: "Dentist",
      date: day(0),
      starts_at: at(0, 15, 30),
      ends_at: at(0, 16, 15),
      all_day: false,
      source: "local",
      area: "personal",
    },
    {
      id: id(),
      user_id: userId,
      title: "Kickoff call",
      date: day(1),
      starts_at: at(1, 10),
      ends_at: at(1, 11),
      all_day: false,
      source: "local",
      area: "professional",
    },
    {
      id: id(),
      user_id: userId,
      title: "Stats lecture",
      date: day(1),
      starts_at: at(1, 14),
      ends_at: at(1, 15, 30),
      all_day: false,
      source: "local",
      area: "education",
    },
    {
      id: id(),
      user_id: userId,
      title: "Coffee with Rae",
      date: day(3),
      starts_at: at(3, 11),
      ends_at: at(3, 12),
      all_day: false,
      source: "local",
      area: "personal",
    },
    {
      id: id(),
      user_id: userId,
      title: "Submission deadline",
      date: day(5),
      all_day: true,
      source: "local",
      area: "education",
    },
    {
      id: id(),
      user_id: userId,
      title: "Away day",
      date: day(8),
      all_day: true,
      source: "local",
      area: "professional",
    },
  ]);

  // ---- Journal and focus sessions ----------------------------------------

  await insert("journal_entries", [
    {
      id: id(),
      user_id: userId,
      date: day(0),
      mood: mood("steady"),
      body: "Slow start, better afternoon. The walk helped more than I expected it to.",
      gratitude: "The light in the kitchen at four o'clock.",
    },
    {
      id: id(),
      user_id: userId,
      date: day(-1),
      mood: mood("good"),
      body: "Got the introduction written in one sitting. Rare and worth writing down.",
      gratitude: "Whoever invented the two-minute rule.",
    },
    {
      id: id(),
      user_id: userId,
      date: day(-3),
      mood: mood("low"),
      body: "Not much today. Made the bed, drank water, called that enough.",
      gratitude: null,
    },
    {
      id: id(),
      user_id: userId,
      date: day(-8),
      mood: mood("steady"),
      body: "Back after a few quiet days. Nothing fell over while I was gone.",
      gratitude: "A week that waited for me.",
    },
    {
      id: id(),
      user_id: userId,
      date: day(-12),
      mood: mood("good"),
      body: "Long walk, then the problem set actually made sense.",
      gratitude: null,
    },
  ]);

  await insert("focus_sessions", [
    { id: id(), user_id: userId, label: "Problem set", minutes: 25, completed_at: at(0, 9, 30) },
    { id: id(), user_id: userId, label: "Welcome pack", minutes: 50, completed_at: at(-1, 14) },
    { id: id(), user_id: userId, label: "Reading", minutes: 25, completed_at: at(-2, 20) },
    { id: id(), user_id: userId, label: "Homepage copy", minutes: 25, completed_at: at(-4, 11) },
    { id: id(), user_id: userId, label: "Problem set", minutes: 50, completed_at: at(-9, 16) },
  ]);

  return counts;
}
