import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { lockNow } from "@/lib/use-passcode";

/**
 * The current Supabase session.
 *
 * Data loading is no longer wired in here — rows are fetched per-collection by
 * React Query once AppGate registers the signed-in user. The only side effect
 * left is relocking on sign-out, so a subsequent sign-in can't land in an
 * already-unlocked tab.
 */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (!active) return;
      setSession(s);
      setLoading(false);
      if (event === "SIGNED_OUT") lockNow();
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, user: session?.user ?? null, loading };
}
