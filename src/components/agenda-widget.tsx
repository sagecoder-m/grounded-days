import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { addDays, format, isToday, isTomorrow, parseISO } from "date-fns";
import { CalendarDays } from "lucide-react";

import { useAppState } from "@/lib/store";
import { dateKey } from "@/lib/dates";
import { FitRows } from "@/components/dashboard/fit-rows";
import { formatTime } from "@/components/ui/time-field";
import type { Area, CalEvent, Task } from "@/lib/store-types";

const AREA_VAR: Record<Area, string> = {
  personal: "var(--sage)",
  professional: "var(--brown)",
  education: "var(--clay)",
};

/** How far ahead the agenda looks. A fortnight is the horizon a term's worth of
 *  deadlines actually lives in; beyond that it stops being a plan. */
const HORIZON_DAYS = 14;

/**
 * Everything ahead, in the order it happens.
 *
 * Distinct from the two widgets it sits beside, and the distinction is the
 * reason it exists. "A look at today" is one day and deliberately refuses to
 * show more. "Upcoming" is the next three, grouped into separate day columns.
 * Neither answers "what does the next fortnight actually look like", because
 * both break the run of time into boxes — and the question people ask before a
 * busy week is a sequence, not a set of days.
 *
 * So this is one continuous list: events and dated work interleaved, in
 * chronological order, with the day named only when it changes. Dense on
 * purpose — the value here is how much of the run you can take in at once.
 */
export function AgendaWidget() {
  const state = useAppState();

  const rows = useMemo(() => {
    const today = new Date();
    const from = dateKey(today);
    const to = dateKey(addDays(today, HORIZON_DAYS));

    type Item =
      | { kind: "event"; date: string; sort: string; event: CalEvent }
      | { kind: "task"; date: string; sort: string; task: Task };

    const items: Item[] = [];

    for (const event of state.events) {
      if (event.date < from || event.date > to) continue;
      items.push({
        kind: "event",
        date: event.date,
        // All-day events sort to the top of their day: they frame it rather
        // than occupy a slot in it. A timed event sorts by its clock time.
        sort: event.allDay || !event.startsAt ? "00:00" : format(new Date(event.startsAt), "HH:mm"),
        event,
      });
    }

    for (const task of state.tasks) {
      if (!task.date || task.date < from || task.date > to) continue;
      // Finished work is not part of what is coming. It stays visible on the
      // day's own list, which is where crossing something off belongs.
      if (task.done) continue;
      /*
        A task with a due time sorts at it, among the day's events.

        The old rule — every task after every event — was reasoning from "a task
        has a date but no time", which is no longer true of coursework. An
        assignment due at 9am is genuinely before a 2pm lecture, and burying it
        under the lecture is the sort of small wrongness that makes a day plan
        untrustworthy. Tasks with no time keep the old position: whenever you
        get to them, which is after the things that are fixed.
      */
      items.push({ kind: "task", date: task.date, sort: task.dueTime || "99:99", task });
    }

    items.sort((a, b) => a.date.localeCompare(b.date) || a.sort.localeCompare(b.sort));
    return items;
  }, [state.events, state.tasks]);

  if (rows.length === 0) {
    return (
      <section className="flex h-full min-h-0 flex-col">
        <h2 className="mb-3 font-serif text-lg">Agenda</h2>
        <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm italic text-ink-soft">
          Nothing scheduled in the next two weeks.
        </p>
      </section>
    );
  }

  /*
    The day label is a row of its own, emitted when the date changes.

    Rendered as a sibling rather than as a heading wrapping each group, so
    FitRows can measure and cut the list anywhere — grouped markup would force
    it to keep or drop a whole day at a time, and the point of this widget is
    the continuous run.
  */
  let lastDate: string | null = null;
  const children = rows.flatMap((item) => {
    const out = [];
    if (item.date !== lastDate) {
      lastDate = item.date;
      out.push(
        <p
          key={`d-${item.date}`}
          data-fit-row
          className="px-1 pb-0.5 pt-2 text-[10px] uppercase tracking-[0.1em] text-ink-soft first:pt-0"
        >
          {dayLabel(item.date)}
        </p>,
      );
    }
    out.push(
      item.kind === "event" ? (
        <AgendaEvent key={`e-${item.event.id}`} event={item.event} />
      ) : (
        <AgendaTask key={`t-${item.task.id}`} task={item.task} />
      ),
    );
    return out;
  });

  return (
    <section className="flex h-full min-h-0 flex-col">
      <h2 className="mb-2 font-serif text-lg">Agenda</h2>
      <FitRows
        renderMore={(hidden) => (
          <Link
            to="/calendar"
            className="mt-1 block px-1 text-center text-xs text-ink-soft underline underline-offset-4 transition-colors hover:text-ink"
          >
            {hidden > 0 ? `+${hidden} more · see the whole calendar` : "See the whole calendar"}
          </Link>
        )}
      >
        {children}
      </FitRows>
    </section>
  );
}

function dayLabel(date: string): string {
  const d = parseISO(date);
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  return format(d, "EEEE d MMMM");
}

/** One scheduled thing. No checkbox: an event happens to you. */
function AgendaEvent({ event }: { event: CalEvent }) {
  const when =
    event.allDay || !event.startsAt ? "all day" : format(new Date(event.startsAt), "h:mm a");
  return (
    <div data-fit-row className="flex items-baseline gap-2 px-1 py-1">
      <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-ink-soft">
        {when}
      </span>
      <CalendarDays
        className="mt-0.5 h-3 w-3 shrink-0"
        style={{ color: event.area ? AREA_VAR[event.area] : "var(--tan)" }}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate text-xs">{event.title}</span>
    </div>
  );
}

/**
 * One piece of dated work.
 *
 * A dot rather than a checkbox, and nothing to press. Ticking things off is
 * what "A look at today" is for; an agenda is for reading, and a row that can
 * be completed invites completing it out of order — the whole fortnight's work
 * one click away is the opposite of one small thing at a time.
 */
function AgendaTask({ task }: { task: Task }) {
  return (
    <div data-fit-row className="flex items-baseline gap-2 px-1 py-1">
      <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-ink-soft">
        {formatTime(task.dueTime) ?? "to do"}
      </span>
      <span
        className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: AREA_VAR[task.area] }}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate text-xs">{task.title}</span>
    </div>
  );
}
