import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/use-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Sprout } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — grounded" },
      {
        name: "description",
        content: "Sign in to grounded to sync your habits, goals, and plans across devices.",
      },
      { property: "og:title", content: "Sign in — grounded" },
      { property: "og:description", content: "Keep your gentle systems safe and synced." },
    ],
  }),
  component: AuthPage,
});

/**
 * Three modes, not two.
 *
 * "reset" exists because it did not, and that was a hole a pilot would have
 * fallen straight into: there was no way to recover a forgotten password
 * anywhere in the app, so a tester who mistyped one at signup was locked out of
 * their own space permanently. For a product whose whole promise is that you
 * can always come back, that was the worst possible thing to be missing.
 */
type Mode = "signin" | "signup" | "reset";

function AuthPage() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  /*
    Set when a signup returns no session, which means the account exists but is
    waiting on a confirmation email. Kept in state rather than inferred, because
    the offer to send it again should appear only to someone who has actually
    just been told to go and look for one.
  */
  const [awaitingConfirm, setAwaitingConfirm] = useState<string | null>(null);
  const { user, loading } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/", replace: true });
  }, [user, loading, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          // Lands them back here signed in via the recovery link; the passcode
          // screen then takes over as it does after any other sign-in.
          redirectTo: `${window.location.origin}/auth`,
        });
        if (error) throw error;
        /*
          Deliberately the same message whether or not that address has an
          account. "No account for that email" tells anyone who asks which of
          our users exist, and this is a product where the membership list is
          itself sensitive.
        */
        toast.success("If there's an account for that address, a reset link is on its way.");
        return;
      }

      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          setAwaitingConfirm(email);
          toast.success("Check your email to confirm your account — take your time.");
          return;
        }
        toast.success("Welcome to grounded. Your data is syncing.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back.");
      }
    } catch (err) {
      // Supabase throws AuthError, but a network failure throws TypeError and a
      // thrown string is possible from anywhere — so this narrows rather than
      // asserting a shape.
      toast.error(err instanceof Error ? err.message : "That didn't work. Try again gently.");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (!awaitingConfirm) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: awaitingConfirm,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      toast.success("Sent again. It can take a few minutes — check spam too.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send that again just now.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center">
      <div className="mb-6 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground">
          <Sprout className="h-5 w-5" />
        </div>
        <h1 className="mt-4 font-serif text-4xl">
          {mode === "signin" ? "Welcome back" : mode === "signup" ? "Make a space" : "No trouble"}
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          {mode === "reset"
            ? "Give us the address you signed up with and we'll send a link to set a new password."
            : "Sign in to keep your habits, goals, and plans safe and synced across devices."}
        </p>
        {mode !== "reset" && (
          <p className="mt-1 text-xs text-ink-soft">
            You'll set a passcode next, so your space stays private on this device.
          </p>
        )}
      </div>

      <div className="card-soft p-6 space-y-5">
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          {/* No password field when the whole point is that they haven't got it. */}
          <div className={mode === "reset" ? "hidden" : "space-y-1.5"}>
            <div className="flex items-baseline justify-between">
              <Label>Password</Label>
              {/* Typo-proofing on the way in, rather than a failed sign-in and
                  no way to see which character went wrong. */}
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-pressed={showPassword}
                className="flex items-center gap-1.5 text-xs text-ink-soft underline-offset-4 transition-colors hover:text-ink hover:underline"
              >
                {showPassword ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <Input
              type={showPassword ? "text" : "password"}
              // Not required in reset mode, or an empty hidden field blocks submit.
              required={mode !== "reset"}
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
            />
          </div>
          <Button type="submit" className="w-full rounded-full" disabled={busy}>
            {busy
              ? "One moment…"
              : mode === "signin"
                ? "Sign in"
                : mode === "signup"
                  ? "Create account"
                  : "Send the link"}
          </Button>
        </form>

        {/*
          Only after a signup that is waiting on an email. The built-in mail
          service is slow and easy to miss, so the recovery is offered where the
          person already is rather than leaving them to guess.
        */}
        {awaitingConfirm && mode === "signup" && (
          <p className="text-center text-xs text-ink-soft">
            Nothing arrived?{" "}
            <button
              type="button"
              onClick={resend}
              disabled={busy}
              className="underline underline-offset-4 disabled:opacity-50"
            >
              Send it again
            </button>
          </p>
        )}

        {mode === "signin" && (
          <p className="text-center text-xs text-ink-soft">
            <button
              type="button"
              className="underline underline-offset-4"
              onClick={() => setMode("reset")}
            >
              Forgotten your password?
            </button>
          </p>
        )}

        <p className="text-center text-xs text-ink-soft">
          {mode === "signin" ? (
            <>
              New here?{" "}
              <button
                type="button"
                className="underline underline-offset-4"
                onClick={() => setMode("signup")}
              >
                Create an account
              </button>
            </>
          ) : (
            <>
              {mode === "signup" ? "Already have a space?" : "Remembered it?"}{" "}
              <button
                type="button"
                className="underline underline-offset-4"
                onClick={() => {
                  setMode("signin");
                  setAwaitingConfirm(null);
                }}
              >
                Sign in instead
              </button>
            </>
          )}
        </p>
      </div>
      <p className="mt-4 text-center text-xs italic text-ink-soft">
        Your data lives in your account, so it's waiting for you on any device.
      </p>
      {/* Before the account, not after. Someone deciding whether to hand over a
          calendar should be able to read what happens to it first — and Google's
          OAuth review looks for exactly this link. */}
      <p className="mt-3 text-center text-xs text-ink-soft">
        <Link to="/privacy" className="underline underline-offset-4 hover:text-ink">
          Privacy
        </Link>
        <span className="mx-2">&middot;</span>
        <Link to="/terms" className="underline underline-offset-4 hover:text-ink">
          Terms
        </Link>
      </p>
    </div>
  );
}
