import { useState } from "react";
import { toast } from "sonner";
import { Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePasscode, lockNow } from "@/lib/use-passcode";
import { PASSCODE_LENGTH } from "@/components/passcode-screen";

/**
 * "Change passcode" for the Profile page. Verification of the old code happens
 * in Postgres, so a wrong current passcode is rejected server-side.
 */
export function PasscodeSettings() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const digitsOnly = (value: string) => value.replace(/\D/g, "").slice(0, PASSCODE_LENGTH);
  const ready =
    current.length >= 4 && next.length === PASSCODE_LENGTH && confirm.length === PASSCODE_LENGTH;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) {
      toast.error("Those didn't match", {
        description: "The new passcode and confirmation differ.",
      });
      return;
    }
    setBusy(true);
    try {
      const ok = await changePasscode(current, next);
      if (!ok) {
        toast.error("That current passcode isn't right");
        return;
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success("Passcode updated");
    } catch (err) {
      toast.error("Couldn't update your passcode", {
        description: err instanceof Error ? err.message : "Try again in a moment.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card-soft p-6 space-y-4">
      <h2 className="font-serif text-2xl">Passcode</h2>
      <p className="text-sm text-ink-soft">
        Your passcode keeps this space private. It's checked on our side, so it never leaves your
        account unprotected.
      </p>

      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-3 max-w-2xl">
        <div className="space-y-1.5">
          <Label htmlFor="pc-current">Current</Label>
          <Input
            id="pc-current"
            inputMode="numeric"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(digitsOnly(e.target.value))}
            placeholder="••••••"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pc-next">New</Label>
          <Input
            id="pc-next"
            inputMode="numeric"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(digitsOnly(e.target.value))}
            placeholder="••••••"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pc-confirm">Confirm new</Label>
          <Input
            id="pc-confirm"
            inputMode="numeric"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(digitsOnly(e.target.value))}
            placeholder="••••••"
          />
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          className="rounded-full"
          disabled={!ready || busy}
          onClick={(e) => void submit(e)}
        >
          {busy ? "Saving…" : `Update passcode`}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-full border-tan"
          onClick={lockNow}
        >
          <Lock className="h-4 w-4" /> Lock now
        </Button>
        <span className="text-xs text-ink-soft">
          {PASSCODE_LENGTH} digits. Forgotten it? Sign out and back in to set a new one.
        </span>
      </div>
    </section>
  );
}
