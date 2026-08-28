import { useId, useState } from "react";
import { Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Every delete in the app goes through this one gate.
 *
 * A single click deleting something was fine right up until it wasn't — the
 * failure mode of "tap, gone" is silent and, for most of what this app holds,
 * permanent. Typing the word is a small tax on a rare action, paid only by the
 * person actually about to do it: nobody types anything to look at their own
 * data, only to erase part of it.
 *
 * The confirm button stays disabled until the typed text matches, rather than
 * merely warning — a warning is something people learn to click past, and this
 * one specific action is exactly the one place that should not become a
 * reflex.
 */
export function ConfirmDeleteButton({
  itemLabel,
  consequence,
  onConfirm,
  className,
  iconClassName = "h-3.5 w-3.5",
  "aria-label": ariaLabel,
}: {
  /** What is being removed, named — "Statistics", "this task" — so the dialog
   *  reads as a specific decision rather than a generic warning. */
  itemLabel: string;
  /** What happens to what's left behind, if it isn't simply gone — "Its
   *  assignments stay" for a course, "This cannot be undone" otherwise. */
  consequence?: string;
  onConfirm: () => void;
  /** Classes for the trigger button itself — callers keep control of size,
   *  color and reveal-on-hover so this drops into an existing row unchanged. */
  className: string;
  iconClassName?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const inputId = useId();
  const armed = typed.trim().toUpperCase() === "DELETE";

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setTyped(""); // Never carry an armed confirmation into the next open.
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className}
        aria-label={ariaLabel ?? `Delete ${itemLabel}`}
      >
        <Trash2 className={iconClassName} />
      </button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {itemLabel}?</AlertDialogTitle>
          <AlertDialogDescription>
            {consequence ?? "This cannot be undone."} Type DELETE to confirm.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor={inputId} className="sr-only">
            Type DELETE to confirm
          </Label>
          <Input
            id={inputId}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="DELETE"
            autoComplete="off"
            autoFocus
            // Enter should not fire the destructive action from a text field —
            // it should do what Enter does everywhere else in a form: nothing
            // dangerous. The button remains the only way to confirm.
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!armed}
            onClick={onConfirm}
            className="bg-[color:var(--clay)] text-primary-foreground hover:bg-[color:var(--clay)]/90 disabled:pointer-events-none disabled:opacity-40"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
