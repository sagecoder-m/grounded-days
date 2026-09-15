import { useIsAdmin } from "./use-is-admin";
import { useIsDemoAccount } from "./use-is-demo-account";

/**
 * Whether this account may see the Consumer/Clinician switch at all.
 *
 * Two accounts, by design: the demo account, whose own data this previews,
 * and HQ, who reviews it — see the "Build Scope Decision" brief and
 * clinician.tsx for why nobody else gets it. Combines the two existing
 * per-account checks rather than adding a third table.
 *
 * "Switching" is ordinary navigation, not a stored preference: the Clinician
 * nav item and the return link on that page are the whole mechanism. A
 * separate remembered POV would let a stale toggle disagree with the URL —
 * one truth (the route) beats two that can drift.
 */
export function useCanUseClinicianPOV(): boolean {
  const { isAdmin } = useIsAdmin();
  const { isDemoAccount } = useIsDemoAccount();
  return isAdmin || isDemoAccount;
}
