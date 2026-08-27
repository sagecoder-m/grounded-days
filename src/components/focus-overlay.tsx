import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * One thing, full screen, with the rest of the app blurred behind it.
 *
 * The brief calls this "expand to a page: fullscreen simple look, showcases
 * content in the box", and draws it as the whole window given over to a single
 * goal with its tasks and nothing else. It is the same idea as the one-at-a-time
 * screen, applied to a box you are already looking at: the surrounding page is
 * not hidden, it is put out of focus, so you keep your place without keeping
 * everything else in view.
 *
 * Blurred rather than dimmed. A dark scrim says "there is a dialog in front of
 * the page"; a blur says "the page is still there, just not what you are
 * attending to" — which is exactly the difference between an interruption and a
 * focus point.
 *
 * Shared deliberately: the goal focus, an expanded course and any future
 * expandable widget are the same component, so the gesture means one thing
 * everywhere it appears. The brief is explicit about that — apply the same rules
 * anywhere the affordance shows up.
 */
export function FocusOverlay({
  title,
  eyebrow,
  onClose,
  children,
  footer,
}: {
  title: string;
  /** Small line above the title: where this came from. */
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const shell = useRef<HTMLDivElement>(null);

  useEffect(() => {
    shell.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // The page behind must not scroll while this is up: scrolling something you
    // cannot see is the fastest way to lose your place in it.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      ref={shell}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background/80 outline-none backdrop-blur-xl"
      onClick={(e) => {
        // Only the backdrop itself, never a click that happened to bubble up
        // from the content — losing your work to a stray click inside the panel
        // is the classic version of this bug.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex justify-end p-4">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid h-9 w-9 place-items-center rounded-full text-ink-soft transition-colors hover:bg-secondary hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mx-auto w-full max-w-2xl px-6 pb-24">
        {eyebrow && <p className="text-xs uppercase tracking-[0.12em] text-ink-soft">{eyebrow}</p>}
        <h1 className="mt-2 font-serif text-3xl leading-tight md:text-4xl">{title}</h1>
        <div className="mt-8">{children}</div>
        {footer && <div className="mt-8">{footer}</div>}
      </div>
    </div>
  );
}

/**
 * The corner control that opens one.
 *
 * A diagonal arrow, matching the brief's own mark, and always in the same corner
 * so it is the same gesture on a course card as on a goal.
 */
export function ExpandButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-secondary hover:text-ink"
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
        <path
          d="M6 2H2v4M10 14h4v-4M2 2l5 5M14 14l-5-5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
