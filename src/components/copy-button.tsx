import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Copy a reply.
 *
 * The assistant's most useful answers are the ones worth moving somewhere else
 * — a plan into a document, a breakdown into a message. Selecting multi-line
 * text by dragging is fiddly on a desktop and genuinely hard on a phone, which
 * is where most of this app is read.
 *
 * Faintly visible rather than hover-only. Hover does not exist on a touch
 * screen, and a control that appears only on hover is a control a phone user
 * never learns is there.
 */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  // Clears on unmount, so a reply copied and then navigated away from does not
  // set state on a component that is gone.
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be refused — an insecure origin, or a browser
      // that wants a fresher user gesture. Saying nothing is better than an
      // error toast for something the user can still do by hand.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
      className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] text-ink-soft opacity-40 transition-opacity hover:bg-secondary hover:text-ink hover:opacity-100 focus-visible:opacity-100"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      <span>{copied ? "Copied" : label}</span>
    </button>
  );
}
