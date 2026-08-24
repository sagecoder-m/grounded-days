import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { AreaChip } from "@/components/area-chip";
import { SoftProgress } from "@/components/soft-progress";
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
  const dated = [
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
          : "event",
    })),
    ...data.tasks
      .filter((t) => !t.done)
      .map((t) => ({
        key: `t-${t.id}`,
        title: t.title,
        area: t.area,
        date: t.date,
        detail: "task",
      })),
  ].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

  return (
    <Shell>
      <header className="mb-8">
        <p className="chip bg-secondary text-ink-soft">Shared with you</p>
        <h1 className="mt-3 font-serif text-4xl">
          {owner ? `${owner}'s grounded` : "A grounded space"}
        </h1>
        <p className="mt-2 text-ink-soft">
          A read-only look at {data.areas.length === 3 ? "everything" : data.areas.join(" and ")}.
          Nothing here can be changed.
        </p>
      </header>

      {data.goals.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 font-serif text-2xl">Goals</h2>
          <div className="space-y-3">
            {data.goals.map((goal) => (
              <div key={goal.id} className="card-soft p-4">
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <span className="font-medium">{goal.name}</span>
                  <AreaChip area={goal.area as Area} />
                </div>
                <SoftProgress value={goal.progress} />
              </div>
            ))}
          </div>
        </section>
      )}

      {dated.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 font-serif text-2xl">Coming up</h2>
          <div className="space-y-2">
            {dated.map((item) => (
              <div
                key={item.key}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3"
              >
                <div className="flex-1">
                  <div className="text-sm font-medium">{item.title}</div>
                  <div className="text-[11px] text-ink-soft">
                    {item.date ?? "someday"} · {item.detail}
                  </div>
                </div>
                {item.area && <AreaChip area={item.area as Area} />}
              </div>
            ))}
          </div>
        </section>
      )}

      {data.habits.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 font-serif text-2xl">Daily habits</h2>
          <div className="flex flex-wrap gap-2">
            {data.habits.map((habit) => (
              <span key={habit.id} className="chip bg-sage-soft text-sage-deep">
                {habit.name}
              </span>
            ))}
          </div>
        </section>
      )}

      {data.goals.length === 0 && dated.length === 0 && data.habits.length === 0 && (
        <div className="card-soft p-8 text-center text-ink-soft italic">
          Nothing to show in what was shared.
        </div>
      )}

      <footer className="mt-10 text-center text-xs text-ink-soft">
        Shared from grounded · read-only
      </footer>
    </Shell>
  );
}
