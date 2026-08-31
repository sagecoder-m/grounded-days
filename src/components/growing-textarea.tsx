import { forwardRef, useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";

/**
 * A composer that grows with what you are writing.
 *
 * The box was a fixed two rows, which is fine for "what should I do today" and
 * wrong for everything this assistant is actually best at. Pasting a syllabus,
 * describing a week, listing six assignments — all of it went into a two-line
 * slot that scrolled internally, so the thing you were composing was mostly
 * above the fold of a box 40 pixels tall. You cannot re-read a paragraph you
 * cannot see, and the app asks for paragraphs.
 *
 * It stops growing at maxRows and scrolls after that, because a composer that
 * grows without limit eventually pushes the conversation off the screen and
 * takes the send button with it.
 */
export const GrowingTextarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { maxRows?: number }
>(function GrowingTextarea({ maxRows = 10, value, className, ...rest }, forwardedRef) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null);

  /*
    Measured, not calculated. Height is set to auto first so scrollHeight
    reports what the content needs rather than what the box currently is —
    without that reset it can only ever grow, and deleting a paragraph leaves a
    tall empty box behind.

    useLayoutEffect rather than useEffect: this runs between React writing the
    DOM and the browser painting it, so the box is never shown at the wrong
    height for a frame.
  */
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    el.style.height = "auto";
    const line = parseFloat(getComputedStyle(el).lineHeight) || 20;
    const padding =
      el.offsetHeight - el.clientHeight + parseFloat(getComputedStyle(el).paddingTop) * 2;
    const max = line * maxRows + padding;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, [value, maxRows]);

  return (
    <textarea
      {...rest}
      value={value}
      ref={(node) => {
        innerRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      }}
      rows={1}
      className={className}
    />
  );
});
