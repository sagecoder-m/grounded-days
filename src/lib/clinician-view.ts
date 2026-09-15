import { dateKey } from "@/lib/dates";
import { AREAS } from "@/lib/share-summary";
import type { SharedView } from "@/lib/share";
import type { AppState } from "@/lib/store-types";

/**
 * Reshapes an already-loaded AppState into the same material share-view's
 * edge function computes for a public link — see share-summary.ts for the
 * vocabulary rules this feeds into, and ShareSummaryView for the component
 * that renders it. Both the Clinician POV page and the admin console's demo
 * preview end up drawing the exact same picture from the exact same rules;
 * only where the numbers come from differs.
 *
 * Deliberately a plain function over data already in memory, not a query.
 * Whoever is looking at their own Clinician POV already has this state
 * loaded for the rest of the app — Overview, the area pages — and re-deriving
 * it here costs nothing and touches nothing new. The one path that genuinely
 * needs a network read is HQ looking at the demo account's data, which is
 * what admin_clinician_preview() exists for; see admin.tsx.
 *
 * Same 56-day window as the SQL version, for the same reason stated there:
 * a therapist's question is "how have the last couple of months gone", not
 * "what happened today".
 */
const SUMMARY_DAYS = 56;

export function deriveClinicianData(state: AppState): SharedView {
  const today = new Date();
  const since = dateKey(new Date(today.getTime() - SUMMARY_DAYS * 86_400_000));

  const completions = state.tasks
    .filter((t) => t.done)
    // updatedAt is when the row last changed, which the rest of the app
    // already treats as "when this was ticked" — see Task.updatedAt.
    .filter((t) => new Date(t.updatedAt) >= new Date(`${since}T00:00:00`))
    .map((t) => ({ area: t.area, date: dateKey(new Date(t.updatedAt)) }));

  const openWork = state.tasks
    .filter((t) => !t.done)
    .map((t) => ({ area: t.area, date: t.date ?? null }));

  const habitCheckins = state.habits.flatMap((h) =>
    Object.entries(h.log)
      .filter(([date, done]) => done && date >= since)
      .map(([date]) => ({ date })),
  );

  return {
    label: null,
    displayName: null,
    areas: AREAS,
    // Deliberately empty: the Clinician POV shows the trend summary only,
    // never a list of task or event titles — the raw content this preview
    // exists to keep out of a clinician-shaped view in the first place.
    tasks: [],
    events: [],
    goals: state.goals.map((g) => ({ id: g.id, name: g.name, area: g.area, progress: g.progress })),
    habits: state.habits.map((h) => ({ id: h.id, name: h.name })),
    since,
    completions,
    openWork,
    habitCheckins,
  };
}
