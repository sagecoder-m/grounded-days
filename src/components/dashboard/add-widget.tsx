import { Plus } from "lucide-react";

import type { WidgetPlacement } from "@/lib/store-types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WIDGETS } from "./widget-registry";

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
}: {
  placements: WidgetPlacement[];
  onAdd: (key: string) => void;
}) {
  const on = new Set(placements.filter((p) => p.enabled).map((p) => p.key));
  const available = WIDGETS.filter((w) => !on.has(w.key));

  if (available.length === 0) {
    return <p className="text-xs italic text-ink-soft">Every widget is on the board</p>;
  }

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
