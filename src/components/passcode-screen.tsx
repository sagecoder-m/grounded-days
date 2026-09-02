import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Lock, Sprout } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSignOut } from "@/lib/use-sign-out";
import { markUnlocked, setPasscode, useLockCountdown, verifyPasscode } from "@/lib/use-passcode";

export const PASSCODE_LENGTH = 6;

/** Shared shell so the lock and setup screens sit identically on the page. */
function PasscodeFrame({
  icon,
  title,
  children,
  footer,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground">
            {icon}
          </div>
          <h1 className="mt-4 font-serif text-3xl">{title}</h1>
        </div>
        <div className="card-soft p-6">{children}</div>
        {footer && <div className="mt-4 text-center">{footer}</div>}
      </div>
    </div>
  );
}

const slotClass =
  "h-12 w-12 rounded-xl border border-border bg-background text-lg first:rounded-l-xl last:rounded-r-xl";

/**
 * One line for whatever the screen has to say, always taking up its space.
 *
 * The status used to be two conditional paragraphs — the busy line and the
 * message — appearing and disappearing as you typed. The card is centred in the
 * viewport, so every change of its height moved the icon, the title and the
 * digits you were looking at: typing the last digit shifted the whole screen up
 * as "One moment…" appeared, and shifted it again when the result replaced it.
 * Two jumps per attempt, at the exact moment you are watching the boxes.
 *
 * Reserving the row costs one line of empty space and nothing moves again.
 */
function StatusLine({
  busy,
  busyLabel,
  message,
  urgent = false,
}: {
  busy: boolean;
  busyLabel: string;
  message: string | null;
  urgent?: boolean;
}) {
  return (
    <p
      aria-live="polite"
      className={cn(
        "min-h-8 text-center text-xs leading-4",
        busy && "italic text-ink-soft",
        !busy && urgent ? "text-[color:var(--clay)]" : "text-ink-soft",
      )}
    >
      {busy ? busyLabel : (message ?? "")}
    </p>
  );
}

function Slots({ mask }: { mask: boolean }) {
  return (
    <InputOTPGroup className="justify-center gap-2">
      {Array.from({ length: PASSCODE_LENGTH }, (_, i) => (
        <InputOTPSlot key={i} index={i} className={slotClass} mask={mask} />
      ))}
    </InputOTPGroup>
  );
}

/**
 * Show/hide for the passcode.
 *
 * Hidden is the default: the whole point of the passcode is privacy on a shared
 * device, and digits large enough to be tapped comfortably are also large
 * enough to be read across a room. The toggle is there because a masked entry
 * you cannot check is its own kind of stressful — mistype once and there is no
 * way to see what went wrong.
 */
function RevealToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={shown}
      className="mx-auto flex items-center gap-1.5 text-xs text-ink-soft underline-offset-4 transition-colors hover:text-ink hover:underline"
    >
      {shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      {shown ? "Hide passcode" : "Show passcode"}
    </button>
  );
}

/**
 * The lock screen. Verification happens in Postgres, so a wrong code costs a
 * round trip and the lockout it reports is authoritative.
 */
export function PasscodeLock() {
  const [code, setCode] = useState("");
  /*
    Where the digits are, so focus can be put back.

    The field is disabled while the code is being checked, which is right — you
    should not be able to type into a verification in flight. The side effect is
    that a wrong code left you with an empty, cleared, *unfocused* field: the
    keyboard closed on a phone and you had to tap the boxes again to retry, at
    the one moment you are least inclined to be patient with the app.
  */
  const fieldRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const signOut = useSignOut();
  const describeLock = useLockCountdown();

  const locked = Boolean(lockedUntil && Date.parse(lockedUntil) > Date.now());

  // Clear the lockout notice once it expires so the input becomes usable again.
  useEffect(() => {
    if (!lockedUntil) return;
    const ms = Date.parse(lockedUntil) - Date.now();
    if (Number.isNaN(ms) || ms <= 0) return;
    const timer = window.setTimeout(() => {
      setLockedUntil(null);
      setMessage(null);
    }, ms + 250);
    return () => window.clearTimeout(timer);
  }, [lockedUntil]);

  /*
    Focus follows the field becoming usable, not the attempt failing.

    Doing it at the point of failure was the obvious thing and did nothing at
    all: `busy` is still true there — it clears in the finally — so the input is
    still disabled, and focusing a disabled input is a no-op. Watching the flag
    that actually gates it is the fix. Measured before and after; the first
    version left focus on <body>.
  */
  useEffect(() => {
    if (busy || locked) return;
    fieldRef.current?.querySelector("input")?.focus();
  }, [busy, locked]);

  const submit = async (candidate: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await verifyPasscode(candidate);
      if (result.ok) {
        markUnlocked();
        return;
      }
      setCode("");
      if (result.reason === "locked") {
        setLockedUntil(result.lockedUntil);
        const wait = describeLock(result.lockedUntil);
        setMessage(
          wait
            ? `Too many tries. Take a breath — you can try again in ${wait}.`
            : "Too many tries. Take a breath and try again shortly.",
        );
        return;
      }
      const left = result.attemptsRemaining;
      setMessage(
        left !== null && left > 0
          ? `That's not it. ${left} ${left === 1 ? "try" : "tries"} left before a short pause.`
          : "That's not it. Try again.",
      );
    } catch (err) {
      setCode("");
      setMessage(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PasscodeFrame
      icon={<Lock className="h-5 w-5" />}
      title="Welcome back"
      footer={
        <button
          type="button"
          onClick={signOut}
          className="text-xs text-ink-soft underline underline-offset-4"
        >
          Forgot your passcode? Sign out
        </button>
      }
    >
      <div className="space-y-4">
        <p className="text-center text-sm text-ink-soft">Enter your passcode to open your space.</p>
        <div ref={fieldRef} className="flex justify-center">
          <InputOTP
            maxLength={PASSCODE_LENGTH}
            value={code}
            onChange={(next) => {
              setCode(next);
              setMessage(null);
              if (next.length === PASSCODE_LENGTH) void submit(next);
            }}
            disabled={busy || locked}
            autoFocus
          >
            <Slots mask={!shown} />
          </InputOTP>
        </div>
        <RevealToggle shown={shown} onToggle={() => setShown((v) => !v)} />
        <StatusLine busy={busy} busyLabel="One moment…" message={message} urgent={locked} />
      </div>
    </PasscodeFrame>
  );
}

/** First-run setup: enter, then confirm. */
export function PasscodeSetup() {
  const [shown, setShown] = useState(false);
  const [step, setStep] = useState<"create" | "confirm">("create");
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const signOut = useSignOut();

  const restart = (note: string) => {
    setFirst("");
    setSecond("");
    setStep("create");
    setMessage(note);
  };

  const commit = async (candidate: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await setPasscode(candidate);
      // has_passcode is cached with staleTime: Infinity, so nudge it directly.
      await queryClient.invalidateQueries({ queryKey: ["grounded"] });
      markUnlocked();
      toast.success("Passcode set. Your space is yours alone.");
    } catch (err) {
      restart(err instanceof Error ? err.message : "That didn't work. Try once more.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PasscodeFrame
      icon={<Sprout className="h-5 w-5" />}
      title={step === "create" ? "Let's set a passcode" : "Once more"}
      footer={
        <button
          type="button"
          onClick={signOut}
          className="text-xs text-ink-soft underline underline-offset-4"
        >
          Sign out instead
        </button>
      }
    >
      <div className="space-y-4">
        <p className="text-center text-sm text-ink-soft">
          {step === "create"
            ? `A ${PASSCODE_LENGTH}-digit code keeps your space private on this device.`
            : "Enter it again so we know it stuck."}
        </p>
        <div className="flex justify-center">
          {step === "create" ? (
            <InputOTP
              key="create"
              maxLength={PASSCODE_LENGTH}
              value={first}
              onChange={(next) => {
                setFirst(next);
                setMessage(null);
                if (next.length === PASSCODE_LENGTH) setStep("confirm");
              }}
              disabled={busy}
              autoFocus
            >
              <Slots mask={!shown} />
            </InputOTP>
          ) : (
            <InputOTP
              key="confirm"
              maxLength={PASSCODE_LENGTH}
              value={second}
              onChange={(next) => {
                setSecond(next);
                setMessage(null);
                if (next.length === PASSCODE_LENGTH) {
                  if (next === first) void commit(next);
                  else restart("Those didn't match. No worries — let's start over.");
                }
              }}
              disabled={busy}
              autoFocus
            >
              <Slots mask={!shown} />
            </InputOTP>
          )}
        </div>
        {/* Especially worth having during setup: a code you cannot see is a code
            you cannot check before committing to it. */}
        <RevealToggle shown={shown} onToggle={() => setShown((v) => !v)} />
        <StatusLine busy={busy} busyLabel="Saving…" message={message} />
        {step === "confirm" && !busy && (
          <div className="text-center">
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full text-xs text-ink-soft"
              onClick={() => restart("")}
            >
              Start over
            </Button>
          </div>
        )}
      </div>
    </PasscodeFrame>
  );
}

/** Neutral placeholder rendered during SSR, hydration, and session checks. */
export function GateSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-4">
        <div className="mx-auto h-12 w-12 animate-pulse rounded-full bg-secondary/60" />
        <div className="h-40 animate-pulse rounded-2xl bg-secondary/60" />
      </div>
    </div>
  );
}
