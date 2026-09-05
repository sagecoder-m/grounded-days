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
/*
  No page limit worth calling a limit.

  This was four pages, which is an arbitrary number to meet on a day you have a
  lot to say. The only real ceiling is the canvas itself: browsers stop
  allocating a backing store somewhere past 16384px on a side, and at a device
  ratio of 2 that is about 500rem of page. Sitting well under it means "add
  another page" never fails, and nobody writing a journal will ever arrive here.
*/
const MAX_HEIGHT = 400;

/**
 * College rule: 7.1mm between lines, which is 27px at 96dpi.
 *
 * Wide rule — the 8.7mm this started with — is what school exercise books use
 * and is generous for adult handwriting. College rule is the notebook most
 * people mean, and fits about a third more on a page.
 */
const RULE = 27;

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

  /*
    Stop the Pencil scrolling the page — at the touch layer, which is the only
    one Safari listens to.

    The first attempt preventDefault'd the pen's *pointer* events, and on the
    iPad the page still moved: erasing scrolled the sheet instead of rubbing
    anything out. Safari decides a scroll from the touch stream, and by the time
    a pointermove is dispatched the pan has already been committed, so
    cancelling there is too late.

    Pencil input also arrives as a TouchEvent whose touch reports
    touchType === "stylus" — Safari's own extension, and the only thing that
    distinguishes a Pencil from a finger at this level. Cancelling those, and
    only those, is what leaves one finger scrolling and two fingers pinching
    while the pen writes without moving anything.
  */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    /** Safari-only, and absent everywhere else — hence the widened type. */
    const isStylus = (touch: Touch) =>
      (touch as Touch & { touchType?: string }).touchType === "stylus";

    const blockStylusScroll = (e: TouchEvent) => {
      if (Array.from(e.touches).some(isStylus)) e.preventDefault();
    };
    /* Kept as well, for browsers where it does work — Chrome on a Surface
       honours it, and it costs nothing where it does not. */
    const blockPenScroll = (e: PointerEvent) => {
      if (e.pointerType === "pen") e.preventDefault();
    };

    canvas.addEventListener("touchstart", blockStylusScroll, { passive: false });
    canvas.addEventListener("touchmove", blockStylusScroll, { passive: false });
    canvas.addEventListener("pointerdown", blockPenScroll, { passive: false });
    canvas.addEventListener("pointermove", blockPenScroll, { passive: false });
    return () => {
      canvas.removeEventListener("touchstart", blockStylusScroll);
      canvas.removeEventListener("touchmove", blockStylusScroll);
      canvas.removeEventListener("pointerdown", blockPenScroll);
      canvas.removeEventListener("pointermove", blockPenScroll);
    };
  }, []);

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
      The Pencil, and nothing else, ever.

      This used to let a finger draw until the first Pencil stroke arrived, on
      the reasoning that a pad which ignores every input is a pad that looks
      broken. On the device that reasoning was wrong twice over: a finger draws
      badly enough that nobody wants the option, and more importantly, fingers
      have a much better job on this page now — they scroll and pinch the sheet
      while the Pencil writes on it. An input cannot both navigate and draw.
    */
    if (e.pointerType !== "pen") return;
    setPenSeen(true);

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
    if (e.pointerType !== "pen") return;

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
      {/*
        The tools stay put while the page scrolls past them.

        A sheet can now be many screens tall, and in the recording the toolbar
        had scrolled away entirely — the writing filled the screen with no way
        to reach Erase or Undo without scrolling back up first. Sticky, with a
        ground behind it so the ink does not run underneath the buttons.
      */}
      <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-full bg-background/85 py-1 backdrop-blur">
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
        {/*
          College rule, and actually visible.

          The first version drew wide rule at 45% opacity, which on the iPad was
          faint enough to be no line at all — writing still drifted uphill,
          which is the entire thing ruling exists to prevent. So: the real
          college measure, and an opacity you can see without it competing with
          the handwriting.

          Two layers rather than one, because a ruled sheet is two different
          things. The horizontals repeat forever and are drawn with a gradient.
          The margin is a single line at a fixed distance from the left edge,
          which a repeating gradient cannot express — it would tile.
        */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            /*
              One line plus background-size, not a repeating gradient with two
              stops. Both tile the same way in theory; in practice the
              two-stop version lands its 1px band on fractional pixels as the
              pattern repeats, so at a device ratio of 2 some lines round to a
              pixel and some to two — the sheet comes out visibly uneven, which
              is worse than no ruling. Sizing a single-line tile leaves the
              rounding to the browser once per tile instead of once per stop.
            */
            backgroundImage: "linear-gradient(to bottom, var(--border-c) 1px, transparent 1px)",
            backgroundSize: `100% ${RULE}px`,
            // Half a line down, so the first rule sits below the top edge the
            // way it does on a sheet rather than hard against it.
            backgroundPosition: `0 ${Math.round(RULE / 2)}px`,
            opacity: 0.8,
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-10 w-px"
          /* The margin, in clay rather than the rule colour — it is the one
             line on a page that is not for writing on. */
          style={{ backgroundColor: "var(--clay)", opacity: 0.28 }}
        />
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onPointerLeave={endStroke}
          style={{
            height: `${height}rem`,
            cursor: tool === "erase" ? "cell" : "crosshair",
            /*
              Fingers navigate; the Pencil writes.

              This was touch-action:none, which stopped the page scrolling under
              a palm and also stopped pinch-zoom entirely — the report was "I
              can't zoom in and out", and that was why. Now that only the Pencil
              can draw, touch has no drawing job to conflict with, so it gets
              its normal one back: one finger pans, two pinch. What still must
              not scroll is the pen, and that is handled by preventing its
              default in the effect below rather than by disabling touch for
              everybody.
            */
            touchAction: "manipulation",
          }}
          className="relative block w-full"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-soft">
          {penSeen
            ? "Pencil only — your hand won't leave a mark."
            : "Write with your Apple Pencil. Fingers scroll and pinch to zoom."}
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
