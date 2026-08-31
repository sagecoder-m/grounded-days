// iCalendar (.ics) parsing, for feed subscriptions.
//
// Google and Microsoft Graph both expand recurring events server-side, so the
// other two providers hand us concrete instances and we never touch RRULE. A
// published .ics does the opposite: it gives one VEVENT plus a recurrence rule
// and expects the client to work out the occurrences. University timetables and
// fixture lists — the whole reason to support feeds — are almost entirely
// recurring, so skipping RRULE would make this feature look broken.
//
// What is expanded: FREQ of DAILY, WEEKLY, MONTHLY and YEARLY, with INTERVAL,
// COUNT, UNTIL, and BYDAY for weekly rules. EXDATE is honoured.
//
// What is not: BYSETPOS, BYMONTHDAY, BYWEEKNO and the rest of RFC 5545's long
// tail. Those are rare in the feeds this is for, and a wrong expansion is worse
// than a missing one — an event on the wrong day is a missed lecture. Anything
// unsupported yields the base occurrence only, and is counted so the sync can
// report it rather than silently dropping dates.

import type { NormalizedEvent } from "./providers.ts";

/** Hard ceiling per rule. A malformed UNTIL far in the future must not turn one
 *  VEVENT into a hundred thousand rows. */
const MAX_OCCURRENCES = 400;

interface RawEvent {
  uid: string;
  summary: string;
  location: string | null;
  url: string | null;
  status: string | null;
  /** Raw DTSTART/DTEND values with their parameters. */
  start: { value: string; isDate: boolean } | null;
  end: { value: string; isDate: boolean } | null;
  rrule: string | null;
  exdates: string[];
}

/**
 * Undo RFC 5545 line folding.
 *
 * A long property is split across lines with each continuation starting with a
 * space or tab. Parsing line-by-line without rejoining truncates every long
 * SUMMARY at 75 octets, which is most of them.
 */
function unfold(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")) {
    if ((raw.startsWith(" ") || raw.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += raw.slice(1);
    } else {
      out.push(raw);
    }
  }
  return out;
}

/** Property text is escaped: \n for newline, and \\ \, \; for literals. */
function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

/** "DTSTART;TZID=Europe/London:20260901T090000" -> name, params, value. */
function splitLine(
  line: string,
): { name: string; params: Record<string, string>; value: string } | null {
  const colon = line.indexOf(":");
  if (colon < 0) return null;
  const left = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts = left.split(";");
  const name = parts[0].toUpperCase();
  const params: Record<string, string> = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
  }
  return { name, params, value };
}

/**
 * An ICS timestamp to a JS Date, plus whether it was a date-only value.
 *
 * Three forms exist: a bare date (all-day), a floating local time, and a UTC
 * time ending in Z. A TZID parameter names a zone we do not attempt to resolve —
 * treating it as floating local time is the honest approximation, and is what
 * most feeds for a single institution mean anyway.
 */
function parseStamp(value: string, isDate: boolean): Date | null {
  const v = value.trim();
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, hh, mm, ss, z] = m;
  if (isDate || hh === undefined) {
    // Midday, not midnight: an all-day value nudged by a timezone conversion
    // anywhere downstream still lands on the intended calendar day.
    return new Date(Number(y), Number(mo) - 1, Number(d), 12, 0, 0);
  }
  if (z) {
    return new Date(
      Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), Number(ss)),
    );
  }
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), Number(ss));
}

/** Local yyyy-mm-dd, never toISOString — that would shift the day west of UTC. */
function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

const DAY_INDEX: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

interface Rule {
  freq: string;
  interval: number;
  count: number | null;
  until: Date | null;
  byDay: number[];
  /** True when the rule used a part we do not implement. */
  unsupported: boolean;
}

function parseRule(rrule: string): Rule {
  const parts: Record<string, string> = {};
  for (const chunk of rrule.split(";")) {
    const eq = chunk.indexOf("=");
    if (eq > 0) parts[chunk.slice(0, eq).toUpperCase()] = chunk.slice(eq + 1);
  }
  const known = new Set(["FREQ", "INTERVAL", "COUNT", "UNTIL", "BYDAY", "WKST"]);
  const unsupported = Object.keys(parts).some((k) => !known.has(k));

  const byDay = (parts.BYDAY ?? "")
    .split(",")
    .map((d) => DAY_INDEX[d.trim().slice(-2).toUpperCase()])
    .filter((n): n is number => typeof n === "number");

  return {
    freq: (parts.FREQ ?? "").toUpperCase(),
    interval: Math.max(1, Number(parts.INTERVAL ?? 1) || 1),
    count: parts.COUNT ? Number(parts.COUNT) : null,
    until: parts.UNTIL ? parseStamp(parts.UNTIL, parts.UNTIL.length === 8) : null,
    byDay,
    unsupported,
  };
}

/**
 * Every start date this rule produces inside the window.
 *
 * Walks forward from the original start rather than from the window, so an
 * INTERVAL greater than one keeps its phase — a fortnightly seminar stays on the
 * right fortnight instead of restarting from whenever the window happens to
 * begin.
 */
function expand(start: Date, rule: Rule, windowStart: Date, windowEnd: Date): Date[] {
  const out: Date[] = [];

  /**
   * An unsupported rule yields only its first occurrence.
   *
   * Expanding it while ignoring the parts we do not implement produces dates
   * that are confidently wrong: a test feed with FREQ=MONTHLY;BYSETPOS=-1;BYDAY=FR
   * — "last Friday of the month" — came out as the 25th of every month, because
   * BYSETPOS was dropped and the day-of-month from DTSTART carried through. A
   * lecture on the wrong day is worse than a lecture that is missing, so the
   * base occurrence is all that is emitted and the sync reports the count.
   */
  if (rule.unsupported) {
    if (start >= windowStart && start <= windowEnd) out.push(new Date(start));
    return out;
  }
  const hardEnd = rule.until && rule.until < windowEnd ? rule.until : windowEnd;

  const push = (d: Date) => {
    if (d >= windowStart && d <= hardEnd) out.push(new Date(d));
  };

  let emitted = 0;
  const countReached = () => rule.count !== null && emitted >= rule.count;

  if (rule.freq === "WEEKLY" && rule.byDay.length > 0) {
    // Walk week by week, emitting each named weekday within it.
    const weekStart = new Date(start);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    let week = 0;
    while (weekStart <= hardEnd && out.length < MAX_OCCURRENCES && !countReached()) {
      if (week % rule.interval === 0) {
        for (const dow of [...rule.byDay].sort((a, b) => a - b)) {
          const d = new Date(weekStart);
          d.setDate(weekStart.getDate() + dow);
          d.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), 0);
          if (d < start) continue;
          emitted += 1;
          if (countReached() && out.length === 0) break;
          push(d);
          if (rule.count !== null && emitted >= rule.count) break;
        }
      }
      weekStart.setDate(weekStart.getDate() + 7);
      week += 1;
    }
    return out;
  }

  const cursor = new Date(start);
  while (cursor <= hardEnd && out.length < MAX_OCCURRENCES && !countReached()) {
    push(cursor);
    emitted += 1;
    switch (rule.freq) {
      case "DAILY":
        cursor.setDate(cursor.getDate() + rule.interval);
        break;
      case "WEEKLY":
        cursor.setDate(cursor.getDate() + 7 * rule.interval);
        break;
      case "MONTHLY":
        cursor.setMonth(cursor.getMonth() + rule.interval);
        break;
      case "YEARLY":
        cursor.setFullYear(cursor.getFullYear() + rule.interval);
        break;
      default:
        // No usable FREQ: the base occurrence only.
        return out;
    }
  }
  return out;
}

export interface IcsParseResult {
  events: NormalizedEvent[];
  /** VEVENTs whose recurrence used a part this parser does not implement. */
  unsupportedRules: number;
  /** VEVENTs skipped because they had no parseable start. */
  skipped: number;
}

/**
 * Parse a feed into concrete instances inside a date window.
 *
 * Windowed for the same reason the other providers are: a feed can hold years of
 * history, and the app only ever shows a few weeks either side of today.
 */
export function parseIcs(text: string, windowStart: Date, windowEnd: Date): IcsParseResult {
  const lines = unfold(text);
  const events: NormalizedEvent[] = [];
  let unsupportedRules = 0;
  let skipped = 0;

  let current: RawEvent | null = null;

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper.startsWith("BEGIN:VEVENT")) {
      current = {
        uid: "",
        summary: "",
        location: null,
        url: null,
        status: null,
        start: null,
        end: null,
        rrule: null,
        exdates: [],
      };
      continue;
    }
    if (upper.startsWith("END:VEVENT")) {
      if (current) emit(current);
      current = null;
      continue;
    }
    if (!current) continue;

    const parsed = splitLine(line);
    if (!parsed) continue;
    const { name, params, value } = parsed;
    const isDate = (params.VALUE ?? "").toUpperCase() === "DATE" || /^\d{8}$/.test(value.trim());

    switch (name) {
      case "UID":
        current.uid = value.trim();
        break;
      case "SUMMARY":
        current.summary = unescapeText(value);
        break;
      case "LOCATION":
        current.location = unescapeText(value) || null;
        break;
      case "URL":
        current.url = value.trim() || null;
        break;
      case "STATUS":
        current.status = value.trim().toUpperCase();
        break;
      case "DTSTART":
        current.start = { value, isDate };
        break;
      case "DTEND":
        current.end = { value, isDate };
        break;
      case "RRULE":
        current.rrule = value.trim();
        break;
      case "EXDATE":
        for (const d of value.split(",")) current.exdates.push(d.trim());
        break;
    }
  }

  function emit(raw: RawEvent) {
    if (!raw.start) {
      skipped += 1;
      return;
    }
    const start = parseStamp(raw.start.value, raw.start.isDate);
    if (!start) {
      skipped += 1;
      return;
    }
    const allDay = raw.start.isDate;
    const end = raw.end ? parseStamp(raw.end.value, raw.end.isDate) : null;
    const durationMs = end && end > start ? end.getTime() - start.getTime() : allDay ? 0 : 3600_000;

    const excluded = new Set(
      raw.exdates
        .map((d) => parseStamp(d, /^\d{8}$/.test(d)))
        .filter((d): d is Date => d !== null)
        .map(dateKey),
    );

    let starts: Date[];
    if (raw.rrule) {
      const rule = parseRule(raw.rrule);
      if (rule.unsupported) unsupportedRules += 1;
      starts = expand(start, rule, windowStart, windowEnd);
    } else {
      starts = start >= windowStart && start <= windowEnd ? [start] : [];
    }

    for (const s of starts) {
      if (excluded.has(dateKey(s))) continue;
      const e = new Date(s.getTime() + durationMs);
      events.push({
        // The UID alone is not unique once a rule is expanded — every instance
        // shares it — so the occurrence date is part of the identity. Without
        // this the upsert would collapse a whole term into one row.
        externalId: raw.rrule ? `${raw.uid}::${dateKey(s)}` : raw.uid,
        calendarId: "feed",
        title: raw.summary || "(untitled)",
        startsAt: allDay ? null : s.toISOString(),
        endsAt: allDay ? null : e.toISOString(),
        allDay,
        date: dateKey(s),
        location: raw.location,
        htmlLink: raw.url,
        cancelled: raw.status === "CANCELLED",
      });
    }
  }

  return { events, unsupportedRules, skipped };
}
