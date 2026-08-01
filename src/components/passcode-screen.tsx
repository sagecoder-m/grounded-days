import { useEffect, useState } from "react";
import { Lock, Sprout } from "lucide-react";
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

function Slots() {
  return (
    <InputOTPGroup className="justify-center gap-2">
      {Array.from({ length: PASSCODE_LENGTH }, (_, i) => (
        <InputOTPSlot key={i} index={i} className={slotClass} />
      ))}
    </InputOTPGroup>
  );
}

/**
 * The lock screen. Verification happens in Postgres, so a wrong code costs a
 * round trip and the lockout it reports is authoritative.
 */
export function PasscodeLock() {
  const [code, setCode] = useState("");
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
        <div className="flex justify-center">
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
            <Slots />
          </InputOTP>
        </div>
        {message && (
          <p
            className={cn(
              "text-center text-xs",
              locked ? "text-[color:var(--clay)]" : "text-ink-soft",
            )}
          >
            {message}
          </p>
        )}
        {busy && <p className="text-center text-xs italic text-ink-soft">One moment…</p>}
      </div>
    </PasscodeFrame>
  );
}

/** First-run setup: enter, then confirm. */
export function PasscodeSetup() {
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
              <Slots />
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
              <Slots />
            </InputOTP>
          )}
        </div>
        {message && <p className="text-center text-xs text-ink-soft">{message}</p>}
        {busy && <p className="text-center text-xs italic text-ink-soft">Saving…</p>}
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
