import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { CalendarDayFlow } from "@/components/calendar-dayflow";

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar — grounded" },
      { name: "description", content: "A calm day, week, month, and year view of your events in grounded." },
      { property: "og:title", content: "Calendar — grounded" },
      { property: "og:description", content: "See your day, week, month, or year at a glance — gently." },
    ],
  }),
  component: CalendarPage,
});

function CalendarPage() {
  return (
    <div className="space-y-8">
      <header>
        <p suppressHydrationWarning className="text-sm text-ink-soft">
          {format(new Date(), "EEEE, MMMM d, yyyy")}
        </p>
        <h1 className="mt-1 font-serif text-2xl md:text-3xl">Your calendar</h1>
        <p className="mt-2 max-w-lg text-ink-soft">
          Everything scheduled, in one quiet place. A day, a week, a month, or the
          whole year. Your tasks live on the overview.
        </p>
      </header>
      <CalendarDayFlow heading="Schedule" />
    </div>
  );
}
