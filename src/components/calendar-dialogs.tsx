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
import { useState } from "react";
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

/**
 * One dialog for everything the calendar can add.
 *
 * It used to make events only, so planning from the calendar meant leaving it
 * for an area page to write down the task the event implied. Events, tasks and
 * goals all belong to an area, so the area picker is shared and the only thing
 * that changes per kind is the dates: an event has a start and an end, a task
 * has a due date, and a goal has neither.
 */
export function AddEventDialog({ defaultDate }: { defaultDate?: string }) {
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
  const [endDate, setEndDate] = useState("");
  const [area, setArea] = useState<string>("personal");

  function reset() {
    setTitle("");
    setEndDate("");
    setOpen(false);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = title.trim();
    if (!name) return;

    if (kind === "event") {
      actions.addEvent({
        title: name,
        date: startDate,
        // Only stored when it differs — a one-day event should not carry a
        // redundant end that could drift out of step with its start.
        endDate: endDate && endDate !== startDate ? endDate : undefined,
        area: area as Area,
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="rounded-full border-tan" size="sm">
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Add to your calendar</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
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

          <DialogFooter>
            <Button type="submit" disabled={endBeforeStart} className="rounded-full">
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
