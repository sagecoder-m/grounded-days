import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { useAppState } from "@/lib/store";
import { useMounted } from "@/lib/use-mounted";
import type { Area } from "@/lib/store-types";

const AREA_VAR: Record<Area, string> = {
  personal: "var(--sage)",
  professional: "var(--brown)",
  education: "var(--clay)",
};

/**
 * A month at a glance: which days carry something, colour-coded by area.
 *
 * This is the "is anything coming?" question, which the full calendar board
 * answers at the cost of most of the screen. Selecting a day reveals just that
 * day's items underneath rather than navigating away.
 */
export function MiniCalendar() {
  const state = useAppState();
  const mounted = useMounted();
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState<Date | null>(null);

  // Every cell keys off today's date, so render a placeholder until the client
  // has mounted rather than risk a server/client mismatch.
  if (!mounted) {
    return <div className="card-soft h-72 animate-pulse rounded-2xl bg-secondary/60" />;
  }

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(cursor)),
    end: endOfWeek(endOfMonth(cursor)),
  });

  const itemsOn = (day: Date) => {
    const iso = format(day, "yyyy-MM-dd");
    return [
      ...state.events
        .filter((e) => e.date === iso)
        .map((e) => ({ id: `e-${e.id}`, title: e.title, area: e.area, kind: "event" as const })),
      ...state.tasks
        .filter((t) => t.date === iso && !t.done)
        .map((t) => ({ id: `t-${t.id}`, title: t.title, area: t.area, kind: "task" as const })),
    ];
  };

  const selectedItems = selected ? itemsOn(selected) : [];

  return (
    <div className="card-soft p-4">
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={() => setCursor(addMonths(cursor, -1))}
          aria-label="Previous month"
          className="rounded-full p-1.5 text-ink-soft transition-colors hover:bg-secondary"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="font-serif text-lg">{format(cursor, "MMMM yyyy")}</div>
        <button
          onClick={() => setCursor(addMonths(cursor, 1))}
          aria-label="Next month"
          className="rounded-full p-1.5 text-ink-soft transition-colors hover:bg-secondary"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-widest text-ink-soft">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={`${d}-${i}`}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const items = itemsOn(day);
          const outside = !isSameMonth(day, cursor);
          const isSelected = selected && isSameDay(day, selected);
          // At most three dots: beyond that the row stops being scannable and
          // the count is what matters, not the exact number.
          const areas = [...new Set(items.map((i) => i.area).filter(Boolean))].slice(0, 3);

          return (
            <button
              key={day.toISOString()}
              onClick={() => setSelected(isSelected ? null : day)}
              className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-xl text-xs transition-colors ${
                outside ? "text-ink-soft/40" : "text-ink"
              } ${isSelected ? "bg-primary text-primary-foreground" : "hover:bg-secondary"} ${
                isToday(day) && !isSelected ? "bg-accent font-medium" : ""
              }`}
            >
              <span className="tabular-nums">{format(day, "d")}</span>
              <span className="flex h-1.5 items-center gap-0.5">
                {areas.map((area) => (
                  <span
                    key={area}
                    className="h-1 w-1 rounded-full"
                    style={{
                      backgroundColor: isSelected
                        ? "var(--primary-foreground)"
                        : AREA_VAR[area as Area],
                    }}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="mb-2 text-xs text-ink-soft">{format(selected, "EEEE, MMMM d")}</div>
          {selectedItems.length === 0 ? (
            <p className="text-xs italic text-ink-soft">Open space.</p>
          ) : (
            <ul className="space-y-1.5">
              {selectedItems.map((item) => (
                <li key={item.id} className="flex items-center gap-2 text-sm">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor: item.area ? AREA_VAR[item.area as Area] : "var(--tan)",
                    }}
                  />
                  <span className="truncate">{item.title}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Link
        to="/calendar"
        className="mt-3 block text-center text-xs text-ink-soft underline underline-offset-4 transition-colors hover:text-ink"
      >
        Open full calendar
      </Link>
    </div>
  );
}
