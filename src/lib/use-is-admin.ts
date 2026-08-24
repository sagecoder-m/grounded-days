import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "./use-session";

/**
 * Whether the signed-in user is an HQ admin.
 *
 * The check is a select against admin_users, whose RLS lets a user see only
 * their own row — so a non-admin's query legitimately returns nothing rather
 * than being told anything about who the admins are. This gate is for showing
 * and hiding UI; the real enforcement is server-side, in the RLS policies on
 * the telemetry tables and the admin check inside the admin-accounts function.
 * Someone who patches this hook to return true gets an admin page full of
 * permission errors, not data.
 */
export function useIsAdmin() {
  const { user } = useSession();
  const query = useQuery({
    queryKey: ["is-admin", user?.id ?? "anon"],
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_users")
        .select("user_id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) return false;
      return Boolean(data);
    },
  });
  return { isAdmin: query.data === true, isLoading: query.isLoading };
}
