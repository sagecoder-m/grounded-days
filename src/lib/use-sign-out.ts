import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { setStoreContext } from "./db/context";
import { lockNow } from "./use-passcode";
import { resetTelemetry } from "./telemetry";

/**
 * The single sign-out path, shared by the sidebar account box and the lock
 * screen's "forgot passcode" escape hatch.
 *
 * Order matters: cancel and clear cached rows before dropping the session, so no
 * in-flight query can repopulate the cache for a user who just left.
 */
export function useSignOut() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useCallback(async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    lockNow();
    setStoreContext(null);
    resetTelemetry();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }, [queryClient, router]);
}
