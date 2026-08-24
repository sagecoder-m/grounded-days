import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { CalendarBoard } from "@/components/calendar-board";

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar — grounded" },
      { name: "description", content: "A calm week, month, and year view of your tasks and events in grounded." },
      { property: "og:title", content: "Calendar — grounded" },
      { property: "og:description", content: "See your week, month, and year at a glance — gently." },
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
        <h1 className="mt-1 font-serif text-4xl md:text-5xl">Your calendar</h1>
        <p className="mt-2 max-w-lg text-ink-soft">
          Everything scheduled, in one quiet place. Week, month, or the whole year.
        </p>
      </header>
      <CalendarBoard tall heading="Schedule" />
    </div>
  );
}
