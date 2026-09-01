import { useMemo, useState } from "react";

import { actions, useAppState } from "@/lib/store";
import { Checkbox } from "@/components/ui/checkbox";
import { FitRows } from "@/components/dashboard/fit-rows";
import { AREA_META } from "@/lib/store";
import type { Area, Task } from "@/lib/store-types";

const AREA_VAR: Record<Area, string> = {
  personal: "var(--sage)",
  professional: "var(--brown)",
  education: "var(--clay)",
};

/**
 * A list you write yourself.
 *
 * Every other widget on this board is derived — today's list is whatever has
 * today's date on it, Upcoming is the next three days, the charts are counts of
 * things already recorded. All of them answer questions about data entered
 * somewhere else, which makes the board something you *read*. There was nowhere
 * on it to simply write down "ring the dentist".
 *
 * So this is the undated tasks, which the app has always been able to store and
 * has never had a home for: no date, no deadline, no place on the calendar,
 * just a list. Adding one takes a line of typing and no dialog, because the
 * whole value is that it is faster than opening anything.
 *
 * Deliberately real tasks rather than a private scratchpad. A note that lives
 * only in a widget is a second place to look for what you have to do, and the
 * point of this app is that there is one. Give one a date later and it moves
 * into today's list and onto the calendar on its own.
 */
export function TodoWidget() {
  const state = useAppState();
  const [draft, setDraft] = useState("");
  const [area, setArea] = useState<Area>("personal");

  const tasks = useMemo(() => {
    /*
      Undated only, and unfinished first.

      A dated task belongs to its day and is already shown there; repeating it
      here would make the board say the same thing twice. Finished ones stay,
      below, until they are cleared — crossing something off and watching it
      disappear denies you the one satisfying part.
    */
    const undated = state.tasks.filter((t) => !t.date);
    const open = undated.filter((t) => !t.done);
    const done = undated.filter((t) => t.done);
    return { open, done, all: [...open, ...done] };
  }, [state.tasks]);

  function add(e: React.FormEvent) {
    e.preventDefault();
    const title = draft.trim();
    if (!title) return;
    actions.addTask({ area, title });
    setDraft("");
  }

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg">To do</h2>
        {tasks.done.length > 0 && (
          <button
            type="button"
            onClick={() => tasks.done.forEach((t) => actions.deleteTask(t.id))}
            className="text-[11px] text-ink-soft underline underline-offset-4 transition-colors hover:text-ink"
          >
            Clear {tasks.done.length} done
          </button>
        )}
      </div>

      {/* The composer sits at the top, not the bottom. This list is meant to be
          added to more often than it is read to the end, and a field that moves
          down the page as the list grows is a field you have to find. */}
      <form onSubmit={add} className="mb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            const order: Area[] = ["personal", "professional", "education"];
            setArea(order[(order.indexOf(area) + 1) % order.length]);
          }}
          aria-label={`Area: ${AREA_META[area].label}. Press to change.`}
          title={`${AREA_META[area].label} — press to change`}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border transition-colors hover:bg-secondary"
        >
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: AREA_VAR[area] }} />
        </button>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Something to do…"
          aria-label="Add something to do"
          className="min-w-0 flex-1 rounded-2xl border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="chip shrink-0 bg-secondary text-ink-soft transition-colors hover:text-ink disabled:opacity-40"
        >
          Add
        </button>
      </form>

      {tasks.all.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm italic text-ink-soft">
          Nothing on the list. Write the next small thing.
        </p>
      ) : (
        <FitRows
          className="space-y-1.5"
          renderMore={(hidden) => (
            <p className="mt-1 px-1 text-center text-xs text-ink-soft">
              {hidden > 0 ? `+${hidden} more` : ""}
            </p>
          )}
        >
          {tasks.all.map((task) => (
            <TodoRow key={task.id} task={task} />
          ))}
        </FitRows>
      )}
    </section>
  );
}

function TodoRow({ task }: { task: Task }) {
  return (
    <div
      data-fit-row
      className="group float-row flex items-baseline gap-2.5 rounded-2xl border border-border bg-card px-3 py-2"
    >
      <Checkbox
        checked={task.done}
        onCheckedChange={() => actions.toggleTask(task.id)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-tan data-[state=checked]:border-primary data-[state=checked]:bg-primary"
      />
      <span
        className={`min-w-0 flex-1 truncate text-sm ${
          task.done ? "text-ink-soft line-through decoration-1" : ""
        }`}
      >
        {task.title}
      </span>
      {/* Direct child, not a descendant — a `.group:hover .reveal-control`
          selector lights up every row's control at once. */}
      <button
        type="button"
        onClick={() => actions.deleteTask(task.id)}
        aria-label={`Remove ${task.title}`}
        title="Remove"
        className="reveal-control shrink-0 text-[11px] text-ink-soft underline underline-offset-4 hover:text-ink"
      >
        remove
      </button>
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: AREA_VAR[task.area] }}
        title={task.area}
      />
    </div>
  );
}
