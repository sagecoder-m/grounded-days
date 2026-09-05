import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * A page you write on with an Apple Pencil.
 *
 * Not Apple's Markup. Markup is a native UIKit surface built on PencilKit, and
 * Safari does not expose either to a web page — there is no API to call, and
 * anything on the web claiming to be Markup is drawing its own canvas. This
 * draws its own canvas, and says so.
 *
 * What Safari on iPadOS does expose is the input underneath, which is most of
 * what makes writing feel like writing:
 *
 * - `pointerType` distinguishes the Pencil from a finger, so only the Pencil
 *   draws. That is palm rejection, for free and exactly right: a hand resting
 *   on the page is a touch, and touches are ignored here.
 * - `pressure` varies the stroke width. It is the single thing that separates
 *   handwriting from a wire drawing.
 * - `getCoalescedEvents()` returns the samples the browser collected between
 *   two animation frames. The Pencil reports far faster than the screen
 *   refreshes, and without this a fast stroke is drawn as a few long straight
 *   segments — visibly a polygon, not a letter.
 *
 * Strokes are drawn immediately and also kept, so undo can repaint the page
 * without the drawn-over pixels coming back.
 */

interface Point {
  x: number;
  y: number;
  /** 0.5 when the device does not report pressure, which is a plain average. */
  p: number;
}

type Stroke = Point[];

const INK = "#2f2a24";
const BASE_WIDTH = 2.4;

export function HandwritingPad({
  onChange,
  initialImage,
}: {
  /** Called with the page as a PNG blob whenever it changes, or null when
   *  cleared. The caller decides when to upload. */
  onChange: (blob: Blob | null) => void;
  /** An existing page to keep writing on. */
  initialImage?: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const background = useRef<HTMLImageElement | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const [penSeen, setPenSeen] = useState(false);

  /* Repaint everything from the kept strokes. Used by undo and by resize —
     a canvas is cleared by any size change, so the strokes are the truth and
     the pixels are a rendering of them. */
  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    if (background.current) {
      ctx.drawImage(background.current, 0, 0, canvas.width / dpr, canvas.height / dpr);
    }

    ctx.strokeStyle = INK;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of strokes.current) drawStroke(ctx, stroke);
  }, []);

  /* Size the canvas to its box at device resolution. Without the devicePixelRatio
     scale, ink on a Retina screen is drawn at half resolution and looks soft
     next to the text beside it. */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      /*
        Never resize to nothing.

        Setting canvas.width wipes the backing store, so a transient zero — a
        parent that is briefly display:none, a measurement taken before layout —
        would erase the page mid-sentence. The strokes are kept and would be
        repainted when a real size arrived, but anything loaded as a background
        image would not, and this is a journal: silently clearing someone's
        handwriting is the one failure here that actually costs something.
      */
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

  // An existing page loads as the background, so adding to yesterday's writing
  // does not mean redrawing it.
  useEffect(() => {
    if (!initialImage) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      background.current = img;
      setHasInk(true);
      repaint();
    };
    img.src = initialImage;
  }, [initialImage, repaint]);

  const emit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => onChange(blob), "image/png");
  }, [onChange]);

  const pointFrom = (e: React.PointerEvent | PointerEvent): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      // Safari reports 0 for a pen that is touching but not pressing, which
      // would draw an invisible line. Treat it as a light stroke.
      p: e.pressure > 0 ? e.pressure : 0.5,
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    /*
      Pen only, when a pen has been seen.

      Not "pen only, always" — that would make the pad dead on a tablet with no
      stylus to hand, which is a worse failure than a slightly wobbly finger
      line. So a finger draws until the first Pencil stroke arrives, and from
      then on the Pencil is the only thing that marks the page and a resting
      hand is ignored.
    */
    if (e.pointerType === "pen") setPenSeen(true);
    else if (penSeen || e.pointerType === "touch") {
      if (penSeen) return;
    }

    /*
      Capture is an optimisation, not a requirement, so it must not be able to
      take the stroke down with it.

      setPointerCapture throws for a pointer the browser is not tracking, and an
      exception here aborts the handler before the stroke has begun — the pen
      then moves across the page and leaves nothing, which reads as the pad
      being broken rather than as one failed call. Caught, and drawing carries
      on without it: capture only matters for a stroke that leaves the canvas
      mid-letter, where the worst case is that the line stops at the edge.
    */
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* keep drawing */
    }
    current.current = [pointFrom(e)];
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!current.current) return;
    if (penSeen && e.pointerType !== "pen") return;

    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    // Every sample the browser gathered since the last frame, not just the
    // latest one — this is what keeps a fast stroke curved.
    const samples =
      typeof e.nativeEvent.getCoalescedEvents === "function"
        ? e.nativeEvent.getCoalescedEvents()
        : [e.nativeEvent];

    for (const sample of samples) {
      const point = pointFrom(sample);
      const stroke = current.current;
      stroke.push(point);
      // Draw only the newest segment rather than repainting: repainting the
      // whole page on every sample is what makes a pad feel laggy.
      if (stroke.length >= 2) {
        ctx.strokeStyle = INK;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        segment(ctx, stroke[stroke.length - 2], point);
      }
    }
  };

  const endStroke = () => {
    if (!current.current) return;
    if (current.current.length > 1) {
      strokes.current.push(current.current);
      setHasInk(true);
    }
    current.current = null;
    emit();
  };

  const undo = () => {
    strokes.current.pop();
    repaint();
    setHasInk(strokes.current.length > 0 || Boolean(background.current));
    emit();
  };

  const clear = () => {
    strokes.current = [];
    background.current = null;
    repaint();
    setHasInk(false);
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
        {/* Ruled like paper, faintly. Writing on a blank white rectangle drifts
            uphill; a line to sit on is the whole reason paper has them. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "repeating-linear-gradient(var(--card) 0 33px, var(--border) 33px 34px)",
            opacity: 0.5,
          }}
        />
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onPointerLeave={endStroke}
          /* touch-none stops the page scrolling under the hand while writing,
             which otherwise makes the pad unusable the moment a palm lands. */
          className="relative block h-[28rem] w-full touch-none"
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-ink-soft">
          {penSeen
            ? "Pencil only — your hand won't leave a mark."
            : "Write with an Apple Pencil, or a finger if you'd rather."}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={undo}
            disabled={strokes.current.length === 0}
            className="gap-1.5 rounded-full border-tan"
          >
            <Undo2 className="h-3.5 w-3.5" />
            Undo
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={clear}
            disabled={!hasInk}
            className="gap-1.5 rounded-full border-tan"
          >
            <Eraser className="h-3.5 w-3.5" />
            Clear
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Width follows pressure. The range is narrow on purpose — a stroke that
 *  swings from hairline to marker reads as a drawing tool, not handwriting. */
function widthFor(p: number): number {
  return BASE_WIDTH * (0.55 + p * 0.9);
}

function segment(ctx: CanvasRenderingContext2D, from: Point, to: Point) {
  ctx.beginPath();
  ctx.lineWidth = widthFor((from.p + to.p) / 2);
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  for (let i = 1; i < stroke.length; i++) segment(ctx, stroke[i - 1], stroke[i]);
}
