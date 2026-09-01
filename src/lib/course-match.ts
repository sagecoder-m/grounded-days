import type { Course } from "@/lib/store-types";

/**
 * Which course a calendar event belongs to, read out of its title.
 *
 * Grounded does not store when a course meets — a Course is a name, a code and
 * a term, with no timetable. So the only record that a class happens on a given
 * day is the event on the calendar it was synced from, and the only link back
 * to the course is what the title says. A student's lecture reads
 * "Programming II: Data Infrastructure (OPAN 6607)" because that is how their
 * university names it, and that is enough to work with.
 *
 * Reading rather than guessing. This never invents a link: it matches a course
 * *code* the person entered themselves, or the course's full name, and returns
 * nothing at all otherwise. An unlabelled event stays an unlabelled event,
 * which is honest — a wrongly-tagged lecture is worse than an untagged one,
 * because it tells you something false about your day.
 *
 * The alternative is a real timetable on the Course itself — days, times,
 * rooms. That is the better answer eventually and a much larger one, needing a
 * schema change and a recurrence model. This works today, with the data people
 * already have.
 */

/** Codes are written every which way — "OPAN 6607", "opan6607", "OPAN-6607". */
function normalise(value: string): string {
  return value.toLowerCase().replace(/[\s\-_.]/g, "");
}

/**
 * The course this event is for, or null.
 *
 * Longest code first, so "OPAN 660" can never win against "OPAN 6607" when
 * both exist — a prefix match on the shorter one would otherwise claim an
 * event belonging to the longer.
 */
export function courseForEvent(title: string, courses: Course[]): Course | null {
  if (!title.trim()) return null;
  const haystack = normalise(title);

  const byCode = courses
    .filter((c) => c.code && c.code.trim().length >= 3)
    .sort((a, b) => (b.code ?? "").length - (a.code ?? "").length);

  for (const course of byCode) {
    if (haystack.includes(normalise(course.code!))) return course;
  }

  /*
    Then the full name, and only the full name. Matching on a word of it would
    tag every event containing "data" or "programming" as that course, which on
    a term with two similar titles is worse than no label at all.

    A floor of four characters, because a course someone named "Lab" would
    otherwise match "Collaborative Lab Meeting" and half the calendar.
  */
  for (const course of courses) {
    const name = normalise(course.name);
    if (name.length >= 4 && haystack.includes(name)) return course;
  }

  return null;
}

/** What to show on screen: the code where there is one, the name otherwise. */
export function courseTag(course: Course): string {
  return course.code || course.name;
}
