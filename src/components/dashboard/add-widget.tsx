import { Plus, RotateCcw } from "lucide-react";

import type { WidgetPlacement } from "@/lib/store-types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MOVABLE_WIDGETS } from "./widget-registry";

/**
 * Putting a widget back on the board.
 *
 * Only lists what is currently off it — a menu that offers to add something
 * already sitting on the board is a menu that has to explain itself. When
 * everything is on, the button says so rather than opening onto nothing.
 *
 * Removing is the X on each tile, not a second list here: the thing you want to
 * remove is the thing you are looking at.
 */
export function AddWidgetMenu({
  placements,
  onAdd,
  onReset,
}: {
  placements: WidgetPlacement[];
  onAdd: (key: string) => void;
  /** Puts every widget back where it started, keeping which ones are on. */
  onReset: () => void;
}) {
  const on = new Set(placements.filter((p) => p.enabled).map((p) => p.key));
  // MOVABLE_WIDGETS, not WIDGETS: pinned furniture is never off the board, so
  // offering to add it would be offering something that cannot happen.
  const available = MOVABLE_WIDGETS.filter((w) => !on.has(w.key));

  return (
    <div className="flex items-center gap-2">
      {/*
        A way back to a board that makes sense.

        Free positioning means a board can be got into a state nobody wants —
        and until the collision bug was fixed, it could get there on its own.
        Without this the only remedy is dragging every widget back by hand.
        Positions only: which widgets are on the board is a separate decision
        and stays as it was.
      */}
      <button
        type="button"
        onClick={onReset}
        title="Put every widget back where it started"
        className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-ink-soft transition-colors hover:border-tan hover:text-ink"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Reset layout
      </button>
      {available.length > 0 && <AddMenu available={available} onAdd={onAdd} />}
    </div>
  );
}

function AddMenu({
  available,
  onAdd,
}: {
  available: typeof MOVABLE_WIDGETS;
  onAdd: (key: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-ink-soft transition-colors hover:border-tan hover:text-ink"
        >
          <Plus className="h-3.5 w-3.5" />
          Add a widget
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {available.map((w) => (
          <DropdownMenuItem
            key={w.key}
            onSelect={() => onAdd(w.key)}
            className="flex cursor-pointer flex-col items-start gap-0.5 py-2"
          >
            <span className="text-sm">{w.label}</span>
            <span className="text-[11px] text-ink-soft">{w.hint}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
