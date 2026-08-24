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

export function AddEventDialog({ defaultDate }: { defaultDate?: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate ?? iso(new Date()));
  const [area, setArea] = useState<string>("personal");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="rounded-full border-tan" size="sm">
          <Plus className="h-3.5 w-3.5" /> Event
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Add an event</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            actions.addEvent({ title: title.trim(), date, area: area as Area });
            setTitle("");
            setOpen(false);
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
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
          <DialogFooter>
            <Button type="submit" className="rounded-full">
              Add event
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
export function EditEventDialog({
  event,
  onClose,
}: {
  event: CalEvent;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(event.title);
  const [date, setDate] = useState(event.date ?? iso(new Date()));

  const save = () => {
    if (!title.trim()) return;
    // Routed through shiftToDate rather than setting `date` alone. Writing just
    // the date on a timed event leaves starts_at pointing at the old day, and
    // the row then disagrees with itself — the day view sorts by starts_at
    // while the calendar filters by date, so the event shows up twice or not at
    // all. The old dialog had this bug; the helper that prevents it already
    // existed and was going unused.
    actions.updateEvent(event.id, { title: title.trim(), ...shiftToDate(event, date) });
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
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
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
          <Button className="rounded-full" onClick={save}>
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
