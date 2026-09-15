import { useIsAdmin } from "./use-is-admin";
import { useIsClinicianAccount } from "./use-is-clinician-account";
import { useIsDemoAccount } from "./use-is-demo-account";

/**
 * Whether this account may see the Clinician nav item at all.
 *
 * Three kinds, by design: a real clinician account (its own roster of
 * assigned patients), the demo account (previewing only itself, unchanged
 * since the first version of this), and HQ (oversight, from the admin
 * console). See clinician.tsx for what each of the three actually sees once
 * there — the gate here only decides who gets the door.
 */
export function useCanUseClinicianPOV(): boolean {
  const { isAdmin } = useIsAdmin();
  const { isDemoAccount } = useIsDemoAccount();
  const { isClinicianAccount } = useIsClinicianAccount();
  return isAdmin || isDemoAccount || isClinicianAccount;
}
