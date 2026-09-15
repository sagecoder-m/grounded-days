/**
 * The clinician point of view — a preview, not the clinical layer.
 *
 * The real clinical-layer spec (consent, a dashboard reading someone else's
 * actual data under a real access model) is deliberately not built here. See
 * the "Build Scope Decision" brief: it recommends deferring that surface
 * until a provider has asked for it. What ships is narrower: a real account a
 * clinician can sign into, a roster HQ assigns by hand, and for each assigned
 * patient the same trend summary a shared link already renders, plus a
 * clinician-only treatment plan and note log. No message a clinician writes
 * is ever delivered to the patient — see the decision this feature was scoped
 * under: real two-way messaging to pilot testers is a separate, bigger call.
 *
 * Three doors behind one gate. useCanUseClinicianPOV() decides who gets past
 * "Not this door" at all; which of the three below they land on is decided
 * by which kind of account they are, not by anything they choose:
 *   - the demo account previews only itself, exactly as the first version of
 *     this page did — no roster, because it is not a clinician account;
 *   - a real clinician account gets its roster and, per patient, three tabs;
 *   - HQ is pointed at the admin console, which already has a roster review
 *     built for it and does not need a second one here.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, Trash2 } from "lucide-react";
import { format, parseISO } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import { ShareSummaryView } from "@/components/share-summary-view";
import { deriveClinicianData } from "@/lib/clinician-view";
import { useAppState, todayISO } from "@/lib/store";
import { useIsAdmin } from "@/lib/use-is-admin";
import { useIsClinicianAccount } from "@/lib/use-is-clinician-account";
import { useIsDemoAccount } from "@/lib/use-is-demo-account";
import { useSession } from "@/lib/use-session";
import { useCanUseClinicianPOV } from "@/lib/use-clinician-pov";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { SharedView } from "@/lib/share";

export const Route = createFileRoute("/clinician")({
  head: () => ({ meta: [{ title: "Clinician view — grounded" }] }),
  // Which patient is open, in the URL — same reasoning journal.index.tsx
  // gives for its own ?date=: a list only a click deep is only useful if the
  // click has somewhere to point, and it survives a reload.
  validateSearch: (search: Record<string, unknown>): { patient?: string } => ({
    patient: typeof search.patient === "string" ? search.patient : undefined,
  }),
  component: ClinicianPage,
});

function ClinicianPage() {
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();
  const { isDemoAccount, isLoading: demoLoading } = useIsDemoAccount();
  const { isClinicianAccount, isLoading: clinicianLoading } = useIsClinicianAccount();

  if (adminLoading || demoLoading || clinicianLoading) {
    return <div className="card-soft h-64 animate-pulse rounded-2xl bg-secondary/60" />;
  }

  if (isDemoAccount) return <DemoSelfPreview />;
  if (isClinicianAccount) return <Roster />;
  if (isAdmin) return <AdminPointer />;

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

function AdminPointer() {
  return (
    <div className="card-soft mx-auto max-w-md p-8 text-center">
      <h1 className="font-serif text-2xl">See it from HQ</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Clinician rosters and previews are reviewed from the admin console, not from here — it
        already has a roster panel built for exactly this.
      </p>
      <Link to="/admin" className="mt-4 inline-block text-sm underline underline-offset-4">
        Open HQ
      </Link>
    </div>
  );
}

/** Unchanged since the first version: the demo account previewing its own
 *  data, client-side, with no network read besides what the rest of the app
 *  already loaded. Not a clinician account, so no roster applies to it. */
function DemoSelfPreview() {
  const state = useAppState();
  const data = deriveClinicianData(state);

  return (
    <div className="space-y-6">
      <header>
        <p className="chip bg-secondary text-ink-soft">Preview</p>
        <h1 className="mt-3 font-serif text-2xl md:text-3xl">How this account has been</h1>
        <p className="mt-2 max-w-prose text-ink-soft">
          What a clinician-shaped view of this data would look like — the same summary a shared link
          already sends, live and in the app instead of behind a token.
        </p>
      </header>
      <ShareSummaryView data={data} today={todayISO()} />
    </div>
  );
}

interface Patient {
  patient_user_id: string;
  patient_email: string;
  display_name: string | null;
}

function Roster() {
  const { patient } = Route.useSearch();

  const roster = useQuery({
    queryKey: ["clinician-my-patients"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("clinician_my_patients");
      if (error) throw error;
      return (data ?? []) as Patient[];
    },
  });

  if (patient) {
    const row = roster.data?.find((p) => p.patient_email === patient);
    return <PatientDetail email={patient} row={row} />;
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="chip bg-secondary text-ink-soft">Clinician view</p>
        <h1 className="mt-3 font-serif text-2xl md:text-3xl">Your patients</h1>
        <p className="mt-2 max-w-prose text-ink-soft">
          Assigned by HQ. For each, the same trend summary a shared link sends, plus a treatment
          plan and notes only you can see — nothing here is ever shown to them.
        </p>
      </header>

      {roster.isLoading ? (
        <div className="card-soft h-40 animate-pulse rounded-2xl bg-secondary/60" />
      ) : roster.data && roster.data.length > 0 ? (
        <div className="space-y-2">
          {roster.data.map((p) => (
            <Link
              key={p.patient_user_id}
              to="/clinician"
              search={{ patient: p.patient_email }}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 transition-colors hover:bg-secondary"
            >
              <span className="text-sm font-medium">
                {p.display_name?.trim() || p.patient_email}
              </span>
              <span className="text-xs text-ink-soft">{p.patient_email}</span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm italic text-ink-soft">
          Nobody is on your roster yet. HQ assigns patients from the admin console.
        </p>
      )}
    </div>
  );
}

function PatientDetail({ email, row }: { email: string; row?: Patient }) {
  const navigate = useNavigate();
  const preview = useQuery({
    queryKey: ["clinician-patient-preview", email],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("clinician_patient_preview", {
        patient_email: email,
      });
      if (error) throw error;
      return data as unknown as SharedView;
    },
  });

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => void navigate({ to: "/clinician", search: {} })}
        className="inline-flex items-center gap-1.5 text-sm text-ink-soft transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to your patients
      </button>

      <header>
        <p className="chip bg-secondary text-ink-soft">Patient</p>
        <h1 className="mt-3 font-serif text-2xl md:text-3xl">
          {row?.display_name?.trim() || email}
        </h1>
      </header>

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="plan">Treatment plan</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="pt-4">
          {preview.isLoading ? (
            <div className="card-soft h-64 animate-pulse rounded-2xl bg-secondary/60" />
          ) : preview.isError || !preview.data ? (
            <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm italic text-ink-soft">
              Could not load this patient's summary.
            </p>
          ) : (
            <ShareSummaryView data={preview.data} today={todayISO()} />
          )}
        </TabsContent>

        <TabsContent value="plan" className="pt-4">
          {row && <PlanEditor patientUserId={row.patient_user_id} />}
        </TabsContent>

        <TabsContent value="notes" className="pt-4">
          {row && <NotesLog patientUserId={row.patient_user_id} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * One editable document per patient — upserted, not versioned. A prototype's
 * working space; nobody but this clinician and HQ can read it, enforced by
 * clinician_patient_plans' own RLS, not by this component.
 */
function PlanEditor({ patientUserId }: { patientUserId: string }) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [loaded, setLoaded] = useState(false);
  const dirty = { current: false };

  const plan = useQuery({
    queryKey: ["clinician-plan", patientUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinician_patient_plans")
        .select("body, updated_at")
        .eq("patient_user_id", patientUserId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (plan.data && !loaded) {
      setBody(plan.data.body);
      setLoaded(true);
    }
  }, [plan.data, loaded]);

  const save = async () => {
    if (!user) return;
    await supabase
      .from("clinician_patient_plans")
      .upsert(
        { clinician_user_id: user.id, patient_user_id: patientUserId, body },
        { onConflict: "clinician_user_id,patient_user_id" },
      );
    void queryClient.invalidateQueries({ queryKey: ["clinician-plan", patientUserId] });
  };

  if (plan.isLoading) {
    return <div className="card-soft h-40 animate-pulse rounded-2xl bg-secondary/60" />;
  }

  return (
    <div className="card-soft space-y-3 p-4 md:p-6">
      <Textarea
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          dirty.current = true;
        }}
        onBlur={() => void save()}
        rows={10}
        placeholder="What you're working toward with this patient, and how."
        className="resize-y bg-background"
      />
      <div className="flex items-center justify-between">
        <p className="text-xs italic text-ink-soft">
          {plan.data?.updated_at
            ? `Last updated ${format(parseISO(plan.data.updated_at), "MMM d, h:mm a")}`
            : "Not written yet."}
        </p>
        <Button type="button" size="sm" onClick={() => void save()} className="rounded-full">
          Save
        </Button>
      </div>
    </div>
  );
}

interface Note {
  id: string;
  body: string;
  created_at: string;
}

/** A dated log the clinician writes to themselves. Never delivered — see the
 *  file header for why this is what "chatbox" became for this prototype. */
function NotesLog({ patientUserId }: { patientUserId: string }) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");

  const notes = useQuery({
    queryKey: ["clinician-notes", patientUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinician_patient_notes")
        .select("id, body, created_at")
        .eq("patient_user_id", patientUserId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Note[];
    },
  });

  const add = async () => {
    const body = draft.trim();
    if (!body || !user) return;
    await supabase
      .from("clinician_patient_notes")
      .insert({ clinician_user_id: user.id, patient_user_id: patientUserId, body });
    setDraft("");
    void queryClient.invalidateQueries({ queryKey: ["clinician-notes", patientUserId] });
  };

  const remove = async (id: string) => {
    await supabase.from("clinician_patient_notes").delete().eq("id", id);
    void queryClient.invalidateQueries({ queryKey: ["clinician-notes", patientUserId] });
  };

  return (
    <div className="space-y-4">
      <div className="card-soft space-y-3 p-4 md:p-6">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder="A note for yourself — nothing here is sent to the patient."
          className="resize-y bg-background"
        />
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            disabled={!draft.trim()}
            onClick={() => void add()}
            className="rounded-full"
          >
            Add note
          </Button>
        </div>
      </div>

      {notes.isLoading ? (
        <div className="h-24 animate-pulse rounded-2xl bg-secondary/40" />
      ) : notes.data && notes.data.length > 0 ? (
        <div className="space-y-2">
          {notes.data.map((n) => (
            <div
              key={n.id}
              className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-ink-soft">
                  {format(parseISO(n.created_at), "MMM d, yyyy · h:mm a")}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{n.body}</p>
              </div>
              <button
                type="button"
                onClick={() => void remove(n.id)}
                aria-label="Delete note"
                className="shrink-0 text-ink-soft transition-colors hover:text-[color:var(--clay)]"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm italic text-ink-soft">
          No notes yet.
        </p>
      )}
    </div>
  );
}
