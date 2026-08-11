import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  format,
  parseISO,
  isToday,
  startOfWeek,
  addWeeks,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  endOfWeek,
  addMonths,
  isSameMonth,
  addYears,
} from "date-fns";
import { actions, useAppState, type CalEvent } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { calendarConnectionsQuery } from "@/lib/db/queries";
import { useSession } from "@/lib/use-session";

export const iso = (d: Date) => format(d, "yyyy-MM-dd");

function itemsFor(date: string, events: any[], tasks: any[]) {
  return [
    ...events.filter((e) => e.date === date).map((e) => ({ ...e, kind: "event" as const })),
    ...tasks.filter((t) => t.date === date).map((t) => ({ ...t, kind: "task" as const })),
  ];
}

function dotColor(area?: string) {
  return area === "personal"
    ? "var(--sage)"
    : area === "professional"
      ? "var(--brown)"
      : area === "education"
        ? "var(--clay)"
        : "var(--tan)";
}

/** Events mirrored from Google/Outlook. Not editable here — the database
 *  rejects client writes to them, so offering an edit affordance would only
 *  produce a failed save. */
function isSynced(it: any) {
  return it.kind === "event" && it.source && it.source !== "local";
}

function ItemPill({ it, onEdit }: any) {
  const synced = isSynced(it);
  const clickable = !synced && (it.kind === "event" || it.kind === "task");
  const time =
    !it.allDay && it.startsAt ? format(new Date(it.startsAt), "h:mma").toLowerCase() : null;

  return (
    <div
      onClick={clickable ? () => onEdit?.(it) : undefined}
      className={`flex items-start gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] leading-snug ${
        // Synced events read as "from elsewhere": dashed edge, tinted surface.
        synced ? "border-dashed border-tan bg-secondary/60" : "border-border bg-card"
      } ${clickable ? "cursor-text hover:border-primary" : ""}`}
      title={
        synced
          ? `${it.title} — from your calendar, read-only`
          : clickable
            ? "Click to edit"
            : it.title
      }
    >
      <span
        className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: dotColor(it.area) }}
      />
      <span
        className={`flex-1 ${it.kind === "task" && it.done ? "line-through text-ink-soft" : ""}`}
      >
        {time && <span className="text-ink-soft">{time} </span>}
        {it.title}
      </span>
    </div>
  );
}

function WeekView({ cursor, events, tasks, onEdit, tall }: any) {
  const start = startOfWeek(cursor);
  const days = eachDayOfInterval({ start, end: endOfWeek(cursor) });
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2 lg:gap-3">
      {days.map((d) => {
        const key = iso(d);
        const items = itemsFor(key, events, tasks);
        return (
          <div
            key={key}
            className={`flex ${tall ? "min-h-48 lg:min-h-[26rem]" : "min-h-40 lg:min-h-64"} flex-col rounded-2xl border p-3 ${
              isToday(d) ? "bg-accent border-primary" : "bg-background border-border"
            }`}
          >
            <div className="flex items-baseline justify-between lg:block">
              <div className="text-[10px] uppercase tracking-widest text-ink-soft">
                {format(d, "EEE")}
              </div>
              <div className="font-serif text-2xl leading-tight">{format(d, "d")}</div>
            </div>
            <div className="mt-2 flex-1 space-y-1.5 overflow-y-auto">
              {items.length === 0 && (
                <div className="text-[11px] italic text-ink-soft">Open space</div>
              )}
              {items.map((it: any) => (
                <ItemPill key={`${it.kind}-${it.id}`} it={it} onEdit={onEdit} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthView({ cursor, events, tasks, onEdit }: any) {
  const start = startOfWeek(startOfMonth(cursor));
  const end = endOfWeek(endOfMonth(cursor));
  const days = eachDayOfInterval({ start, end });
  return (
    <div>
      <div className="grid grid-cols-7 mb-2">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-center text-[10px] uppercase text-ink-soft tracking-widest">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const key = iso(d);
          const items = itemsFor(key, events, tasks);
          const outside = !isSameMonth(d, cursor);
          return (
            <div
              key={key}
              className={`min-h-24 md:min-h-28 rounded-xl border p-1.5 text-xs ${
                isToday(d) ? "bg-accent border-primary" : "bg-background border-border"
              } ${outside ? "opacity-40" : ""}`}
            >
              <div className="font-medium">{format(d, "d")}</div>
              <div className="mt-1 space-y-1">
                {items.slice(0, 3).map((it: any) => (
                  <button
                    key={`${it.kind}-${it.id}`}
                    onClick={() => onEdit?.(it)}
                    className="flex w-full items-center gap-1 truncate text-left text-[10px] hover:underline"
                    title="Click to edit"
                  >
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: dotColor(it.area) }}
                    />
                    <span className="truncate">{it.title}</span>
                  </button>
                ))}
                {items.length > 3 && (
                  <div className="text-[10px] text-ink-soft">+{items.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function YearView({ cursor, events, tasks, onEdit }: any) {
  const year = cursor.getFullYear();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: 12 }, (_, i) => {
        const monthDate = new Date(year, i, 1);
        const prefix = `${year}-${String(i + 1).padStart(2, "0")}`;
        const items = [
          ...events
            .filter((e: any) => e.date?.startsWith(prefix))
            .map((e: any) => ({ ...e, kind: "event" as const })),
          ...tasks
            .filter((t: any) => t.date?.startsWith(prefix))
            .map((t: any) => ({ ...t, kind: "task" as const })),
        ].sort((a: any, b: any) => a.date.localeCompare(b.date));
        return (
          <div key={i} className="rounded-2xl border border-border bg-background p-3">
            <div className="flex items-baseline justify-between">
              <div className="font-serif text-base">{format(monthDate, "MMMM")}</div>
              <div className="text-[10px] text-ink-soft">{items.length} scheduled</div>
            </div>
            <div className="mt-2 space-y-1">
              {items.length === 0 && (
                <div className="text-[11px] italic text-ink-soft">Nothing scheduled</div>
              )}
              {items.slice(0, 6).map((it: any) => (
                <button
                  key={`${it.kind}-${it.id}`}
                  onClick={() => onEdit?.(it)}
                  className="flex w-full items-center gap-1.5 truncate text-left text-[11px] hover:underline"
                  title="Click to edit"
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: dotColor(it.area) }}
                  />
                  <span className="tabular-nums text-ink-soft">
                    {format(parseISO(it.date), "d")}
                  </span>
                  <span className="truncate">{it.title}</span>
                </button>
              ))}
              {items.length > 6 && (
                <div className="text-[10px] text-ink-soft">+{items.length - 6} more</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function AddEventDialog() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(iso(new Date()));
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
            actions.addEvent({ title: title.trim(), date, area: area as any });
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

function EditItemDialog({ item, onClose }: { item: any; onClose: () => void }) {
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? "");
  const [date, setDate] = useState(item.date ?? iso(new Date()));
  const isEvent = item.kind === "event";

  const save = () => {
    if (!title.trim()) return;
    if (isEvent) actions.updateEvent(item.id, { title: title.trim(), date });
    else
      actions.updateTask(item.id, {
        title: title.trim(),
        description: description.trim() || undefined,
        date,
      });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-card">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">
            Edit {isEvent ? "event" : "task"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </div>
          {!isEvent && (
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          )}
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
              if (isEvent) actions.deleteEvent(item.id);
              else actions.deleteTask(item.id);
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
 * way — once events are flowing the dashed pills say it better than a label.
 */
function SyncedHint() {
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

export function CalendarBoard({
  tall = false,
  heading = "Calendar",
}: {
  tall?: boolean;
  heading?: string;
}) {
  const state = useAppState();
  const defaultView = state.settings.defaultCalView;
  // null means "follow the saved default"; picking a view here overrides it for
  // this board only. Settings now arrive asynchronously, so initialising state
  // from them once would strand the board on whatever loaded first.
  const [override, setOverride] = useState<"week" | "month" | "year" | null>(null);
  const view = override ?? defaultView;
  const [cursor, setCursor] = useState(new Date());
  const [editing, setEditing] = useState<any>(null);

  const step = (dir: number) =>
    setCursor(
      view === "week"
        ? addWeeks(cursor, dir)
        : view === "month"
          ? addMonths(cursor, dir)
          : addYears(cursor, dir),
    );

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="font-serif text-2xl">{heading}</h2>
        <div className="flex items-center gap-2">
          <SyncedHint />
          <div className="flex rounded-full bg-secondary p-1">
            {(["week", "month", "year"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setOverride(v)}
                className={`chip capitalize ${view === v ? "bg-primary text-primary-foreground" : "text-ink-soft"}`}
              >
                {v}
              </button>
            ))}
          </div>
          <AddEventDialog />
        </div>
      </div>
      <div className="card-soft p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <button className="chip bg-secondary" onClick={() => step(-1)}>
            ‹ prev
          </button>
          <div className="font-serif text-lg">
            {view === "week" &&
              `${format(startOfWeek(cursor), "MMM d")} – ${format(endOfWeek(cursor), "MMM d, yyyy")}`}
            {view === "month" && format(cursor, "MMMM yyyy")}
            {view === "year" && format(cursor, "yyyy")}
          </div>
          <button className="chip bg-secondary" onClick={() => step(1)}>
            next ›
          </button>
        </div>
        {view === "week" && (
          <WeekView
            cursor={cursor}
            events={state.events}
            tasks={state.tasks}
            onEdit={setEditing}
            tall={tall}
          />
        )}
        {view === "month" && (
          <MonthView
            cursor={cursor}
            events={state.events}
            tasks={state.tasks}
            onEdit={setEditing}
          />
        )}
        {view === "year" && (
          <YearView cursor={cursor} events={state.events} tasks={state.tasks} onEdit={setEditing} />
        )}
        <p className="mt-4 text-center text-[11px] italic text-ink-soft">
          Tap anything on the calendar to edit it.
        </p>
      </div>
      {editing && <EditItemDialog item={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

export type { CalEvent };
