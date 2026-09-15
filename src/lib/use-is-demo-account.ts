import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "./use-session";

/**
 * Whether the signed-in user is the demo account.
 *
 * Mirrors useIsAdmin() exactly, for the same reason: the check is a select
 * against demo_users, whose RLS lets an account see only its own row, so
 * anyone else's query legitimately returns nothing rather than revealing
 * which account is the demo one. This gate decides what to render — the
 * Consumer/Clinician switch and the Clinician nav item — not what can be
 * read. Being the demo account grants no extra data access at all; it only
 * ever sees its own tasks/goals/habits, exactly as any account already can.
 */
export function useIsDemoAccount() {
  const { user } = useSession();
  const query = useQuery({
    queryKey: ["is-demo-account", user?.id ?? "anon"],
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("demo_users")
        .select("user_id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) return false;
      return Boolean(data);
    },
  });
  return { isDemoAccount: query.data === true, isLoading: query.isLoading };
}
