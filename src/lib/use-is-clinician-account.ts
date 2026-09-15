import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "./use-session";

/**
 * Whether the signed-in user is a clinician account.
 *
 * Mirrors useIsAdmin() and useIsDemoAccount() exactly: a select against
 * clinician_users, whose RLS lets an account see only its own row. This gate
 * decides what renders — the roster instead of Overview, the Clinician nav
 * item — not what can be read. The real authorization for a specific
 * patient's data lives in clinician_patient_preview()'s own roster check.
 */
export function useIsClinicianAccount() {
  const { user } = useSession();
  const query = useQuery({
    queryKey: ["is-clinician-account", user?.id ?? "anon"],
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinician_users")
        .select("user_id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) return false;
      return Boolean(data);
    },
  });
  return { isClinicianAccount: query.data === true, isLoading: query.isLoading };
}
