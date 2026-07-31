import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/use-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sprout } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Grounded" },
      { name: "description", content: "Sign in to Grounded to sync your habits, goals, and plans across devices." },
      { property: "og:title", content: "Sign in — Grounded" },
      { property: "og:description", content: "Keep your gentle systems safe and synced." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const { user, loading } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/", replace: true });
  }, [user, loading, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success("Check your email to confirm your account — take your time.");
          return;
        }
        toast.success("Welcome to Grounded. Your data is syncing.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back.");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "That didn't work. Try again gently.");
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
        <h1 className="mt-4 font-serif text-4xl">{mode === "signin" ? "Welcome back" : "Make a space"}</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Sign in to keep your habits, goals, and plans safe and synced across devices.
        </p>
      </div>

      <div className="card-soft p-6 space-y-5">
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div className="space-y-1.5">
            <Label>Password</Label>
            <Input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
            />
          </div>
          <Button type="submit" className="w-full rounded-full" disabled={busy}>
            {busy ? "One moment…" : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>
        <p className="text-center text-xs text-ink-soft">
          {mode === "signin" ? "New here?" : "Already have a space?"}{" "}
          <button
            type="button"
            className="underline underline-offset-4"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin" ? "Create an account" : "Sign in instead"}
          </button>
        </p>
      </div>
      <p className="mt-4 text-center text-xs italic text-ink-soft">
        Not ready? Everything keeps working offline on this device.
      </p>
    </div>
  );
}
