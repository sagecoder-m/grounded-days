/**
 * The clinician point of view — a preview, not the clinical layer.
 *
 * The real clinical-layer spec (access tiers, consent, a dashboard reading
 * someone else's actual data) is deliberately not built here. See the "Build
 * Scope Decision" brief: it recommends deferring that surface until a
 * provider has asked for it, both because building it first risks the wrong
 * dashboard and because a surface receiving client health data has no
 * business in production during a pilot before the business-associate
 * question is settled.
 *
 * What this page is: one account previewing what a clinician-shaped view of
 * its *own* data would look like, using the exact rendering already built and
 * tested for a shared link — see share-summary.ts's vocabulary rules and
 * ShareSummaryView. Nothing here reads anyone else's data; a signed-in
 * account looking at this page sees its own tasks/goals/habits, reshaped.
 *
 * Gating: useCanUseClinicianPOV() only decides what renders — same doctrine
 * as admin.tsx. The demo account and HQ are the only two it returns true for,
 * and neither gets anything from being on this page that RLS did not already
 * let them read on every other page in the app.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { ShareSummaryView } from "@/components/share-summary-view";
import { deriveClinicianData } from "@/lib/clinician-view";
import { useAppState, todayISO } from "@/lib/store";
import { useCanUseClinicianPOV } from "@/lib/use-clinician-pov";

export const Route = createFileRoute("/clinician")({
  head: () => ({
    meta: [{ title: "Clinician view — grounded" }],
  }),
  component: ClinicianPage,
});

function ClinicianPage() {
  const canView = useCanUseClinicianPOV();

  if (!canView) {
    return (
      <div className="card-soft mx-auto max-w-md p-8 text-center">
        <h1 className="font-serif text-2xl">Not this door</h1>
        <p className="mt-2 text-sm text-ink-soft">
          This page previews work that has not shipped yet.
        </p>
        <Link to="/" className="mt-4 inline-block text-sm underline underline-offset-4">
          Back to overview
        </Link>
      </div>
    );
  }

  return <Preview />;
}

function Preview() {
  const state = useAppState();
  const data = deriveClinicianData(state);

  return (
    <div className="space-y-6">
      <header>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="chip bg-secondary text-ink-soft">Preview</p>
          {/* The other half of the switch. Getting here is the Clinician nav
              item; getting back is this — ordinary navigation is the whole
              mechanism, see use-clinician-pov.ts. */}
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs text-ink-soft underline underline-offset-4 transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to consumer view
          </Link>
        </div>
        <h1 className="mt-3 font-serif text-2xl md:text-3xl">How this account has been</h1>
        <p className="mt-2 max-w-prose text-ink-soft">
          What a clinician-shaped view of this data would look like — the same summary a shared link
          already sends, live and in the app instead of behind a token. Not the clinical layer
          itself: no other account's data is reachable from here, and nothing on this page is
          visible to anyone besides this account and HQ.
        </p>
      </header>

      <ShareSummaryView data={data} today={todayISO()} />
    </div>
  );
}
