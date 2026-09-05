import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser, PenLine, Redo2, Trash2, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A notebook page you write on with an Apple Pencil.
 *
 * Not Apple's Markup. Markup is a native UIKit surface built on PencilKit, and
 * Safari exposes neither to a web page — there is no API to call, and anything
 * on the web calling itself Markup is drawing its own canvas. This draws its
 * own, and says so.
 *
 * What Safari on iPadOS does expose is the input underneath:
 *
 * - `pointerType` separates the Pencil from a finger, so a resting hand leaves
 *   no mark. Palm rejection, for free.
 * - `pressure` varies the stroke width, which is the one thing separating
 *   handwriting from a wire drawing.
 * - `getCoalescedEvents()` returns the samples gathered between two frames.
 *   The Pencil reports far faster than the screen refreshes, and without this a
 *   fast stroke is drawn as a few straight segments — a polygon, not a letter.
 *
 * Everything is kept as strokes, not pixels. That is what makes undo, redo and
 * a growing page possible at all: the canvas is a rendering of the strokes, so
 * it can be thrown away and rebuilt at any size without losing a word.
 */

interface Point {
  x: number;
  y: number;
  /** 0.5 when the device reports no pressure, which is a plain average. */
  p: number;
}

/** An eraser stroke is kept rather than applied destructively, so undo can take
 *  back an erase the same way it takes back a word. */
interface Stroke {
  mode: Tool;
  points: Point[];
}

type Tool = "ink" | "erase";

const INK = "#2f2a24";
const BASE_WIDTH = 2.4;
const ERASER_WIDTH = 22;

/** A page's worth of height, and how much "more room" adds. Deliberately
 *  generous: the first version was 28rem and the report was that there was
 *  nowhere to actually write. */
const PAGE = 42;
const MORE = 24;
const MAX_HEIGHT = PAGE + MORE * 4;

export function HandwritingPad({
  onChange,
  initialImage,
}: {
  /** The page as a PNG whenever it changes, or null when cleared. */
  onChange: (blob: Blob | null) => void;
  initialImage?: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const undone = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const background = useRef<HTMLImageElement | null>(null);

  const [tool, setTool] = useState<Tool>("ink");
  const [penSeen, setPenSeen] = useState(false);
  const [height, setHeight] = useState(PAGE);
  // Counts rather than booleans, so the buttons re-render when a stroke lands —
  // a ref changing does not itself cause a render.
  const [counts, setCounts] = useState({ done: 0, undone: 0, hasBackground: false });

  const sync = useCallback(
    () =>
      setCounts({
        done: strokes.current.length,
        undone: undone.current.length,
        hasBackground: Boolean(background.current),
      }),
    [],
  );

  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    /*
      An existing page is drawn at its own aspect ratio, anchored top-left —
      never stretched to fill. Stretching would distort yesterday's handwriting
      the moment the page grew taller, which is the one thing a notebook must
      never do to what is already written.
    */
    const bg = background.current;
    if (bg && bg.width > 0) {
      const width = canvas.width / dpr;
      ctx.drawImage(bg, 0, 0, width, (bg.height / bg.width) * width);
    }

    for (const stroke of strokes.current) drawStroke(ctx, stroke);
    ctx.globalCompositeOperation = "source-over";
  }, []);

  /* Size the backing store to the box, at device resolution. Without the dpr
     scale, ink on a Retina screen is drawn at half resolution and looks soft
     beside the text next to it. */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      /* Never resize to nothing: setting width wipes the backing store, so a
         transient zero — a parent briefly hidden, a measurement before layout —
         would erase the page mid-sentence. */
      if (rect.width < 1 || rect.height < 1) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      repaint();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [repaint]);

  useEffect(() => {
    if (!initialImage) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      background.current = img;
      repaint();
      sync();
    };
    img.src = initialImage;
  }, [initialImage, repaint, sync]);

  const emit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0) return;
    canvas.toBlob((blob) => onChange(blob), "image/png");
  }, [onChange]);

  const pointFrom = (e: { clientX: number; clientY: number; pressure: number }): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      // Safari reports 0 for a pen touching but not pressing, which would draw
      // an invisible line.
      p: e.pressure > 0 ? e.pressure : 0.5,
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    /*
      Pen only, once a pen has been seen.

      Not "pen only, always": that leaves the pad dead on a tablet with no
      stylus to hand. A finger draws until the first Pencil stroke arrives, and
      from then on only the Pencil marks the page and a resting hand is ignored.
    */
    if (e.pointerType === "pen") setPenSeen(true);
    else if (penSeen) return;

    /* Capture is an optimisation and must not be able to take the stroke down
       with it: it throws for a pointer the browser is not tracking, and an
       exception here aborts the handler before the stroke begins — the pen then
       moves across the page and leaves nothing. */
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* keep drawing */
    }

    current.current = { mode: tool, points: [pointFrom(e.nativeEvent)] };
    // A new mark ends the redo trail, the same as every editor.
    undone.current = [];
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const stroke = current.current;
    if (!stroke) return;
    if (penSeen && e.pointerType !== "pen") return;

    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    /*
      The samples gathered since the last frame, or the event itself.

      The fallback is not only for browsers without the API. getCoalescedEvents
      can legitimately return an *empty* list — it does for any event the
      browser did not generate itself — and taking that literally means a stroke
      that records no points at all: the pen moves, the page stays blank, and
      nothing anywhere reports an error. Falling back on empty costs one
      comparison and removes the whole failure mode.
    */
    const coalesced =
      typeof e.nativeEvent.getCoalescedEvents === "function"
        ? e.nativeEvent.getCoalescedEvents()
        : [];
    const samples = coalesced.length > 0 ? coalesced : [e.nativeEvent];

    for (const sample of samples) {
      const point = pointFrom(sample);
      stroke.points.push(point);
      // Draw the newest segment only. Repainting the whole page per sample is
      // what makes a pad feel laggy under a fast hand.
      if (stroke.points.length >= 2) {
        segment(ctx, stroke.mode, stroke.points[stroke.points.length - 2], point);
      }
    }
  };

  const endStroke = () => {
    const stroke = current.current;
    current.current = null;
    if (!stroke) return;
    if (stroke.points.length > 1) {
      strokes.current.push(stroke);
      sync();
    }
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) ctx.globalCompositeOperation = "source-over";
    emit();
  };

  const undo = () => {
    const last = strokes.current.pop();
    if (last) undone.current.push(last);
    repaint();
    sync();
    emit();
  };

  const redo = () => {
    const next = undone.current.pop();
    if (next) strokes.current.push(next);
    repaint();
    sync();
    emit();
  };

  const clear = () => {
    strokes.current = [];
    undone.current = [];
    background.current = null;
    repaint();
    sync();
    onChange(null);
  };

  const empty = counts.done === 0 && !counts.hasBackground;

  return (
    /*
      Selection is switched off across the whole pad, not just the canvas.

      This is the "resting my hand highlights things" report. touch-action stops
      the page scrolling under a palm and does nothing about selection: a hand
      landing on the page still starts a text selection on whatever is under it,
      and iOS then throws up its selection handles and callout mid-sentence.
      user-select and touch-callout are what actually stop that, and they have
      to cover the toolbar and the captions too, because a palm is wider than
      the canvas.
    */
    <div className="select-none space-y-2 [-webkit-touch-callout:none] [-webkit-user-select:none]">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-full border border-tan">
          <ToolButton active={tool === "ink"} onClick={() => setTool("ink")} label="Write">
            <PenLine className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton active={tool === "erase"} onClick={() => setTool("erase")} label="Erase">
            <Eraser className="h-3.5 w-3.5" />
          </ToolButton>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={undo}
          disabled={counts.done === 0}
          aria-label="Undo"
          className="gap-1.5 rounded-full border-tan"
        >
          <Undo2 className="h-3.5 w-3.5" />
          Undo
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={redo}
          disabled={counts.undone === 0}
          aria-label="Redo"
          className="gap-1.5 rounded-full border-tan"
        >
          <Redo2 className="h-3.5 w-3.5" />
          Redo
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={clear}
          disabled={empty}
          aria-label="Clear the page"
          className="ml-auto gap-1.5 rounded-full border-tan text-ink-soft"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear
        </Button>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
        {/* Ruled like paper. Writing on a blank rectangle drifts uphill; a line
            to sit on is the whole reason paper has them. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "repeating-linear-gradient(var(--card) 0 33px, var(--border) 33px 34px)",
            opacity: 0.45,
          }}
        />
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onPointerLeave={endStroke}
          style={{ height: `${height}rem`, cursor: tool === "erase" ? "cell" : "crosshair" }}
          /* touch-none stops the page scrolling under the hand mid-word. */
          className="relative block w-full touch-none"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-soft">
          {penSeen
            ? "Pencil only — your hand won't leave a mark."
            : "Write with an Apple Pencil, or a finger if you'd rather."}
        </p>
        {/* A notebook adds a page rather than asking you to write smaller. */}
        {height < MAX_HEIGHT && (
          <button
            type="button"
            onClick={() => setHeight((h) => Math.min(MAX_HEIGHT, h + MORE))}
            className="shrink-0 text-xs text-ink-soft underline underline-offset-4 transition-colors hover:text-ink"
          >
            More room
          </button>
        )}
      </div>
    </div>
  );
}

function ToolButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-ink-soft hover:bg-secondary",
      )}
    >
      {children}
      {label}
    </button>
  );
}

/** Width follows pressure, over a narrow range — a stroke swinging from
 *  hairline to marker reads as a drawing tool, not handwriting. */
function widthFor(p: number): number {
  return BASE_WIDTH * (0.55 + p * 0.9);
}

function segment(ctx: CanvasRenderingContext2D, mode: Tool, from: Point, to: Point) {
  /*
    The eraser clears pixels rather than painting the background colour.
    Painting over would look right until the page was saved with a transparent
    background, at which point every "erased" area would come back as an opaque
    smear over the writing underneath.
  */
  ctx.globalCompositeOperation = mode === "erase" ? "destination-out" : "source-over";
  ctx.strokeStyle = INK;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.lineWidth = mode === "erase" ? ERASER_WIDTH : widthFor((from.p + to.p) / 2);
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  for (let i = 1; i < stroke.points.length; i++) {
    segment(ctx, stroke.mode, stroke.points[i - 1], stroke.points[i]);
  }
}
