import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { format, parseISO } from "date-fns";

import { AreaChip } from "@/components/area-chip";
import { ShareSummaryView } from "@/components/share-summary-view";
import { fetchSharedView, type SharedView } from "@/lib/share";
import type { Area } from "@/lib/store-types";

export const Route = createFileRoute("/share")({
  // The token lives in the query string rather than the path so this stays a
  // single prerendered route on a static host, with no 404-fallback rewrite.
  validateSearch: (search: Record<string, unknown>): { t?: string } => ({
    t: typeof search.t === "string" ? search.t : undefined,
  }),
  component: SharePage,
});

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-2xl px-4 py-10 md:px-8">{children}</div>
    </div>
  );
}

function Quiet({ title, body }: { title: string; body: string }) {
  return (
    <Shell>
      <div className="card-soft p-8 text-center">
        <h1 className="font-serif text-3xl">{title}</h1>
        <p className="mt-3 text-ink-soft">{body}</p>
      </div>
    </Shell>
  );
}

function SharePage() {
  const { t } = Route.useSearch();

  const view = useQuery({
    queryKey: ["share", t],
    queryFn: () => fetchSharedView(t!),
    enabled: Boolean(t),
    retry: false,
    // A share is a snapshot someone opens once; refetching on focus would just
    // spend their data.
    refetchOnWindowFocus: false,
  });

  if (!t) {
    return <Quiet title="Nothing to see here" body="This link is missing its code." />;
  }
  if (view.isPending) {
    return (
      <Shell>
        <div className="space-y-4">
          <div className="h-10 w-2/3 animate-pulse rounded-2xl bg-secondary/60" />
          <div className="h-40 animate-pulse rounded-2xl bg-secondary/60" />
        </div>
      </Shell>
    );
  }
  // Expired, revoked and never-existed are indistinguishable by design, so the
  // message covers all three without guessing which it was.
  if (view.isError || !view.data) {
    return (
      <Quiet
        title="This link isn't active"
        body="It may have expired or been turned off. Ask for a fresh one."
      />
    );
  }

  return <SharedDashboard data={view.data} />;
}

function SharedDashboard({ data }: { data: SharedView }) {
  const owner = data.displayName?.trim();
  const today = new Date().toISOString().slice(0, 10);

  /* The next fortnight, kept but demoted. Someone opening this link wants the
     shape of the last two months first; what is coming up is detail they can
     scroll to. Capped, because a full list is the overwhelming thing this page
     was reported as being. */
  const coming = [
    ...data.events.map((e) => ({
      key: `e-${e.id}`,
      title: e.title,
      area: e.area,
      date: e.date,
      detail:
        !e.allDay && e.startsAt
          ? new Date(e.startsAt).toLocaleTimeString(undefined, {
              hour: "numeric",
              minute: "2-digit",
            })
          : "all day",
    })),
    ...data.tasks
      .filter((t) => !t.done)
      .map((t) => ({
        key: `t-${t.id}`,
        title: t.title,
        area: t.area,
        date: t.date,
        detail: "to do",
      })),
  ]
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))
    .slice(0, 8);

  return (
    <Shell>
      <header className="mb-8">
        <p className="chip bg-secondary text-ink-soft">Shared with you</p>
        <h1 className="mt-3 font-serif text-3xl md:text-4xl">
          {owner ? `How ${owner} has been` : "How things have been"}
        </h1>
        <p className="mt-2 max-w-prose text-ink-soft">
          A read-only summary, shared on purpose. It shows where attention has gone and where
          something might be worth asking about — not a score, and nothing here can be changed.
        </p>
      </header>

      <ShareSummaryView data={data} today={today} />

      {coming.length > 0 && (
        <section className="mt-10">
          <h2 className="font-serif text-xl">Coming up</h2>
          <p className="mt-1 mb-3 text-sm text-ink-soft">The next couple of weeks.</p>
          <div className="space-y-1.5">
            {coming.map((item) => (
              <div key={item.key} className="flex items-baseline gap-3 py-1">
                <span className="w-16 shrink-0 text-[11px] tabular-nums text-ink-soft">
                  {item.date ? format(parseISO(item.date), "EEE d MMM") : "someday"}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
                {item.area && <AreaChip area={item.area as Area} />}
              </div>
            ))}
          </div>
        </section>
      )}

      {/*
        What this page is not.

        Worth stating outright, for both readers. For whoever was given the
        link: counts describe a period, not a person, and they cannot see a
        reason. For whoever shared it: the reassurance that the private half of
        the app stayed private is the thing that makes sharing the rest
        possible at all.
      */}
      <footer className="mt-12 border-t border-border pt-6 text-sm text-ink-soft">
        <p className="max-w-prose">
          This is a summary, not an assessment. Numbers here show what was recorded, not why — a
          quiet month can be rest, illness, or a season when things were tracked somewhere else.
        </p>
        <p className="mt-3 max-w-prose">
          Journal entries are never included in a shared link, and neither are descriptions or
          notes. Shared from grounded · read-only ·{" "}
          {data.label ? `"${data.label}"` : "this link can be turned off at any time"}.
        </p>
      </footer>
    </Shell>
  );
}
