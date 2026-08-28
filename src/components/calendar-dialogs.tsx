/**
 * The event dialogs and the sync hint, lifted out of calendar-board.tsx so they
 * outlive it. Nothing here changed behaviour in the move — the add form still
 * writes the same three fields, and the edit form still offers title, date and
 * remove.
 *
 * The one thing that did change is scope: the old EditItemDialog edited events
 * *and* tasks, because the old board drew both in its day cells. Tasks are now
 * edited in place in the tasks panel, where TaskRow already gives them inline
 * title and description editing, a date picker and a delete — so this file only
 * deals with events.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { actions } from "@/lib/store";
import type { Area, CalEvent } from "@/lib/store-types";
import { calendarConnectionsQuery } from "@/lib/db/queries";
import { shiftToDate } from "@/lib/schedule";
import { useSession } from "@/lib/use-session";

export const iso = (d: Date) => format(d, "yyyy-MM-dd");

/** What the calendar can create. All three carry a day now: an event has a start
 *  and an end, a task has a due date, a goal has an optional target. */
type AddKind = "event" | "task" | "goal";

const KINDS: { key: AddKind; label: string; hint: string }[] = [
  { key: "event", label: "Event", hint: "Something happening on the calendar" },
  { key: "task", label: "Task", hint: "Something to do, with a due date" },
  { key: "goal", label: "Goal", hint: "Something to work towards, by a chosen day" },
];

/** What a drag or a right-click "New event" on the grid hands over — the shape
 *  it dragged out, with no title yet. See the `draft` prop below. */
export interface EventDraft {
  startDate: string;
  endDate?: string;
  allDay: boolean;
  startTime?: string;
  endTime?: string;
}

/**
 * One dialog for everything the calendar can add.
 *
 * It used to make events only, so planning from the calendar meant leaving it
 * for an area page to write down the task the event implied. Events, tasks and
 * goals all belong to an area, so the area picker is shared and the only thing
 * that changes per kind is the dates: an event has a start and an end, a task
 * has a due date, and a goal has neither.
 */
export function AddEventDialog({
  defaultDate,
  draft,
  onDraftHandled,
}: {
  defaultDate?: string;
  /**
   * Set when a drag or a right-click "New event" on the grid started this,
   * rather than the +Add button — see calendar-dayflow.tsx's onEventCreate.
   *
   * DayFlow's own drag-to-create and its right-click "New event" both end by
   * calling one callback with a bare, untitled event at the shape that was
   * dragged out. Nothing was listening for it before this existed, so the
   * gesture visibly did nothing: DayFlow's internal state briefly held the new
   * event, and the very next render of useDayFlowEventSync reconciled it away
   * again, since the app's own `events` array — the only thing that survives
   * a render — had never heard of it. Routing the callback here instead opens
   * this same dialog, pre-filled with what was dragged, so the one thing a
   * drag cannot supply — a title, and which area it belongs to — is still
   * asked for through the app's one editing surface rather than skipped.
   */
  draft?: EventDraft | null;
  /** Called once the draft has been either saved or dismissed, so the parent
   *  clears it and a closed dialog does not reopen on the next render. */
  onDraftHandled?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<AddKind>("event");
  const [title, setTitle] = useState("");
  /**
   * Never defaults into the past.
   *
   * defaultDate is the start of whatever period the calendar is showing, which
   * is useful when looking at a future month but wrong when looking at the
   * current one: the visible week began on Monday, so a task added on Wednesday
   * was born with a Monday due date and appeared immediately under "Still
   * waiting". Today wins unless the visible period starts later than today.
   */
  const todayKey = iso(new Date());
  const [startDate, setStartDate] = useState(
    defaultDate && defaultDate > todayKey ? defaultDate : todayKey,
  );
  /**
   * Re-syncs when the calendar's visible period changes underneath an already-
   * mounted dialog.
   *
   * The state above only ran its initializer once, on this component's first
   * mount — which happens before the calendar has ever reported a visible
   * range, so defaultDate was still undefined and startDate latched onto
   * today permanently. Paging the calendar forward and opening "+Add" kept
   * defaulting to today rather than the period actually on screen, silently
   * contradicting the comment above that today should only win when nothing
   * later is in view.
   */
  useEffect(() => {
    setStartDate(defaultDate && defaultDate > todayKey ? defaultDate : todayKey);
    // Only when the calendar's own range moves — not on every render, or a
    // day picked by hand in the field below would get overwritten back to it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultDate]);
  const [endDate, setEndDate] = useState("");
  const [area, setArea] = useState<string>("personal");
  /**
   * Times, off by default.
   *
   * A pair of time inputs was deliberately left out of the *edit* dialog
   * (below) because editing a dragged event's time risked disagreeing with
   * where it visually sat on the grid. Creating one has no such position to
   * disagree with, so the gap here was not that design choice — it was that
   * there was simply no way to give a new event a time at all, on the
   * dialog or the grid. "All day" keeps the common case (an appointment with
   * no particular hour) at one click, same as before this existed.
   */
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");

  /**
   * A fresh draft always wins — it is new information about a gesture that
   * just happened, arriving after this dialog already mounted and already
   * has its own state for the +Add-button path. Runs after the defaultDate
   * effect above for the same reason that one exists: only a prop actually
   * changing should move these fields, never a re-render.
   */
  useEffect(() => {
    if (!draft) return;
    setKind("event");
    setTitle("");
    setStartDate(draft.startDate);
    setEndDate(draft.endDate ?? "");
    setAllDay(draft.allDay);
    if (draft.startTime) setStartTime(draft.startTime);
    if (draft.endTime) setEndTime(draft.endTime);
    setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  function reset() {
    setTitle("");
    setEndDate("");
    setAllDay(true);
    setOpen(false);
    onDraftHandled?.();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = title.trim();
    if (!name) return;

    if (kind === "event") {
      // Timed only for a single day — a start and end hour describe one
      // sitting, and a "1pm to 2pm" spanning several calendar days is not a
      // shape this form tries to collect.
      const singleDay = !endDate || endDate === startDate;
      const timed = !allDay && singleDay && startTime && endTime;
      // `new Date("yyyy-MM-ddTHH:mm:00")` with no offset is read as local
      // time by the browser, which is what the time inputs mean — the person
      // typed 1pm in their own timezone, not UTC. toISOString() is what turns
      // that into the UTC instant the timestamptz column actually needs;
      // sending the naive string straight through would have PostgREST parse
      // it as UTC and store 1pm as 1pm UTC, quietly shifting every event by
      // the local offset.
      const startsAt = timed ? new Date(`${startDate}T${startTime}:00`).toISOString() : undefined;
      const endsAt = timed ? new Date(`${startDate}T${endTime}:00`).toISOString() : undefined;
      actions.addEvent({
        title: name,
        date: startDate,
        // Only stored when it differs — a one-day event should not carry a
        // redundant end that could drift out of step with its start.
        endDate: endDate && endDate !== startDate ? endDate : undefined,
        area: area as Area,
        startsAt,
        endsAt,
      });
    } else if (kind === "task") {
      actions.addTask({ area: area as Area, title: name, date: startDate });
    } else {
      // The date used to be collected and then dropped on the floor here, so a
      // goal added from a particular day on the calendar landed with no
      // connection to that day at all.
      actions.addGoal({ area: area as Area, name, targetDate: startDate || undefined });
    }
    reset();
  }

  // An end before the start is the one input the database rejects outright, so
  // it is caught here rather than surfaced as a failed save.
  const endBeforeStart = Boolean(endDate) && endDate < startDate;
  const timeInvalid =
    kind === "event" &&
    !allDay &&
    (!endDate || endDate === startDate) &&
    Boolean(startTime) &&
    Boolean(endTime) &&
    endTime <= startTime;

  return (
    // Closing runs through reset() rather than bare setOpen(false): the
    // Escape key, an outside click and the corner X all fire onOpenChange
    // without ever touching submit(), and a cancelled draft still has to
    // tell the calendar to drop it or the next render reopens this dialog
    // with the same stale draft.
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : reset())}>
      <DialogTrigger asChild>
        <Button variant="outline" className="rounded-full border-tan" size="sm">
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">
            {draft ? "Name this event" : "Add to your calendar"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {/* Only the +Add button offers a choice of kind. A drag or a
              right-click "New event" on the grid can only ever mean an
              event — there is no gesture on a day cell that means "task"
              or "goal" instead. */}
          {!draft && (
            <div className="space-y-1.5">
              <Label>What is it?</Label>
              <div className="flex flex-wrap gap-2">
                {KINDS.map((k) => (
                  <button
                    key={k.key}
                    type="button"
                    title={k.hint}
                    onClick={() => setKind(k.key)}
                    className={`chip ${
                      kind === k.key
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-ink-soft"
                    }`}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{kind === "goal" ? "Goal" : "Title"}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </div>

          {kind === "event" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ev-start">Start date</Label>
                <Input
                  id="ev-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-end">End date</Label>
                <Input
                  id="ev-end"
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  placeholder="same day"
                />
              </div>

              {/* A time only means one thing when the event lives on a single
                  day — "1pm to 2pm" spanning several days is not a shape this
                  form asks for, so the toggle disappears rather than offering
                  an hour that would be ignored. */}
              {(!endDate || endDate === startDate) && (
                <div className="col-span-2 space-y-2.5">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={allDay}
                      onChange={(e) => setAllDay(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-tan accent-[color:var(--brown)]"
                    />
                    All day
                  </label>
                  {!allDay && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="ev-start-time">Start time</Label>
                        <Input
                          id="ev-start-time"
                          type="time"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="ev-end-time">End time</Label>
                        <Input
                          id="ev-end-time"
                          type="time"
                          value={endTime}
                          min={startTime}
                          onChange={(e) => setEndTime(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {kind === "task" && (
            <div className="space-y-1.5">
              <Label htmlFor="task-due">Due date</Label>
              <Input
                id="task-due"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
          )}

          {kind === "goal" && (
            <div className="space-y-1.5">
              <Label htmlFor="goal-target">Target date</Label>
              <Input
                id="goal-target"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              {/* Said plainly, because an empty date field usually reads as
                  something you forgot rather than something you chose. */}
              <p className="text-xs text-ink-soft">
                Optional. Clear it if this one isn&rsquo;t working to a date.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Area</Label>
            <Select value={area} onValueChange={setArea}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="personal">Personal</SelectItem>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="education">Education</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {endBeforeStart && (
            <p className="text-xs text-[color:var(--clay)]">
              The end date is before the start date.
            </p>
          )}
          {timeInvalid && (
            <p className="text-xs text-[color:var(--clay)]">
              The end time is before the start time.
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={endBeforeStart || timeInvalid} className="rounded-full">
              Add {kind}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Times are deliberately absent. Dragging an event on the grid is now the way
 * to change when it happens, and a pair of time inputs that silently disagreed
 * with where the block sat would be worse than not offering them.
 */
export function EditEventDialog({ event, onClose }: { event: CalEvent; onClose: () => void }) {
  const [title, setTitle] = useState(event.title);
  const [date, setDate] = useState(event.date ?? iso(new Date()));
  const [endDate, setEndDate] = useState(event.endDate ?? "");

  const save = () => {
    if (!title.trim()) return;
    // Routed through shiftToDate rather than setting `date` alone. Writing just
    // the date on a timed event leaves starts_at pointing at the old day, and
    // the row then disagrees with itself — the day view sorts by starts_at
    // while the calendar filters by date, so the event shows up twice or not at
    // all. The old dialog had this bug; the helper that prevents it already
    // existed and was going unused.
    actions.updateEvent(event.id, {
      title: title.trim(),
      ...shiftToDate(event, date),
      // Cleared back to a single day when emptied or set equal to the start.
      endDate: endDate && endDate !== date ? endDate : undefined,
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-card">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Edit event</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-start">Start date</Label>
              <Input
                id="edit-start"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-end">End date</Label>
              <Input
                id="edit-end"
                type="date"
                value={endDate}
                min={date}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          {endDate && endDate < date && (
            <p className="text-xs text-[color:var(--clay)]">
              The end date is before the start date.
            </p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            className="rounded-full text-ink-soft"
            onClick={() => {
              actions.deleteEvent(event.id);
              onClose();
            }}
          >
            <Trash2 className="h-4 w-4" /> Remove
          </Button>
          <Button
            className="rounded-full"
            disabled={Boolean(endDate) && endDate < date}
            onClick={save}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Points at Profile when nothing is connected, and otherwise gets out of the
 * way — once events are flowing, the calendar says it better than a label.
 */
export function SyncedHint() {
  const { user } = useSession();
  const connections = useQuery({
    ...calendarConnectionsQuery(user?.id ?? ""),
    enabled: Boolean(user),
  });

  if ((connections.data?.length ?? 0) > 0) return null;

  return (
    <Link to="/profile" className="hidden text-[10px] italic text-ink-soft underline md:inline">
      Connect Google or Outlook
    </Link>
  );
}
