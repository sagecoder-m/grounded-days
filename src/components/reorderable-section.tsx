import { useState, type ReactNode } from "react";
import { GripVertical } from "lucide-react";

import { actions, type Settings } from "@/lib/store";
import { WidgetFrame } from "@/components/widget-frame";

/**
 * Drag-to-reorder for the Overview's sections, on the page itself.
 *
 * Reordering already existed, but only in Profile — you had to leave the page
 * you were arranging, move rows in an abstract list, then come back to see the
 * result. Doing it in place means you are dragging the actual thing.
 *
 * Pointer events rather than HTML5 drag-and-drop: the native API does not fire
 * on touch at all, which would have made this desktop-only. Same reason the
 * calendar moved off it.
 *
 * The handle is always present, faint until you approach it.
 *
 * It used to use .reveal-control — hidden until the section was hovered. That
 * made it literally unreachable: the handle sits in the margin to the LEFT of
 * the section, outside its box, and .group/section:hover only fires while the
 * pointer is inside that box. Moving toward the handle left the hover zone, so
 * it faded out before the cursor arrived. A control that vanishes as you reach
 * for it is worse than one that is always there, and a drag affordance nobody
 * can find is not an affordance at all.
 */

/** Where a dragged section would land, or null when nothing is being dragged. */
export interface DragState {
  key: string;
  overKey: string | null;
}

export function ReorderableSection({
  sectionKey,
  widgets,
  drag,
  setDrag,
  onDragOver,
  onDrop,
  children,
}: {
  sectionKey: string;
  widgets: Settings["widgets"];
  drag: DragState | null;
  setDrag: (next: DragState | null) => void;
  /** Called as the cursor passes over another tile, so the board rearranges
   *  live instead of waiting for the drop. */
  onDragOver: (key: string, over: string) => void;
  /** Called once, on release: the single write. */
  onDrop: () => void;
  children: ReactNode;
}) {
  const [grabbed, setGrabbed] = useState(false);
  const isDragging = drag?.key === sectionKey;

  return (
    <WidgetFrame widgetKey={sectionKey} widgets={widgets}>
      <div
        data-section={sectionKey}
        /*
          No insertion line any more. It existed because nothing moved until you
          let go, so something had to say where the tile would land; now the
          board rearranges as you drag and the answer is simply what you are
          looking at.

          The tile being carried lifts instead: slightly raised, slightly
          transparent, so it reads as held rather than as broken.
        */
        className={`group/section relative transition-[opacity,transform] duration-150 ${
          isDragging ? "z-20 scale-[1.02] opacity-70" : ""
        }`}
      >
        <button
          type="button"
          aria-label={`Reorder this section. Press and drag, or use arrow keys.`}
          onPointerDown={(e) => {
            e.preventDefault();
            // Capture keeps the gesture attached to this handle even when the
            // cursor leaves it, which is the whole drag. It throws if the
            // pointer id is not one the browser is tracking, and an exception
            // here would abort the rest of this handler and leave the drag
            // never starting — so a failure to capture degrades to a drag that
            // still works while the cursor stays over the page.
            try {
              (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
            } catch {
              /* not capturable; carry on */
            }
            setGrabbed(true);
            setDrag({ key: sectionKey, overKey: null });
          }}
          onPointerMove={(e) => {
            // Pointer capture (set above) routes every subsequent pointer event to
            // this button, so the sections underneath never fire onPointerEnter
            // during a real drag — which is why dragging did nothing while a
            // synthetic test that dispatched pointerenter straight at the target
            // appeared to pass. The element under the cursor has to be looked up.
            if (!drag) return;
            const under = document.elementFromPoint(e.clientX, e.clientY);
            const over = under?.closest("[data-section]")?.getAttribute("data-section") ?? null;
            if (!over || over === sectionKey) return;
            // Rearrange now rather than remembering a target for later.
            onDragOver(sectionKey, over);
          }}
          onPointerUp={() => {
            setGrabbed(false);
            onDrop();
          }}
          onPointerCancel={() => {
            setGrabbed(false);
            onDrop();
          }}
          onKeyDown={(e) => {
            // Keyboard equivalent, because a drag handle that only responds to a
            // pointer is unusable for anyone not using one.
            if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
            e.preventDefault();
            const index = widgets.findIndex((w) => w.key === sectionKey);
            const target = index + (e.key === "ArrowUp" ? -1 : 1);
            if (index < 0 || target < 0 || target >= widgets.length) return;
            const next = [...widgets];
            [next[index], next[target]] = [next[target], next[index]];
            actions.reorderWidgets(next);
          }}
          // -left-6 is the column gap exactly (gap-6), not a guess. The handle
          // used to sit at -left-9 with a 32px box, which was fine when every
          // widget was full width and it had the page margin to sit in. Now that
          // two widgets can share a row, that offset put the right-hand widget's
          // handle 12px inside the left-hand widget's card. Filling the gap
          // precisely keeps it in the margin in both columns.
          className={`absolute -left-1 top-0 z-10 grid h-8 w-8 place-items-center rounded-lg text-ink-soft opacity-40 transition-all hover:bg-secondary hover:text-ink hover:opacity-100 focus-visible:opacity-100 md:-left-6 md:w-6 ${
            grabbed ? "cursor-grabbing bg-secondary text-ink opacity-100" : "cursor-grab"
          }`}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {children}
      </div>
    </WidgetFrame>
  );
}
