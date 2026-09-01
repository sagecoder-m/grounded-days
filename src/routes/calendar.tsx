import { createFileRoute } from "@tanstack/react-router";
import { CalendarDayFlow } from "@/components/calendar-dayflow";
import { CalendarHeader, CalendarPending } from "@/components/calendar-skeleton";

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar — grounded" },
      {
        name: "description",
        content: "A calm day, week, month, and year view of your events in grounded.",
      },
      { property: "og:title", content: "Calendar — grounded" },
      {
        property: "og:description",
        content: "See your day, week, month, or year at a glance — gently.",
      },
    ],
  }),
  component: CalendarPage,
  /*
    Its own pending state, not the app-wide one.

    The generic placeholder is a title-shaped bar over a 288px panel, which is
    the right guess for most pages here and the wrong one for this: the calendar
    is twice that tall and its header is static text that needs no data at all.
    Showing bars where the heading already belongs, then swapping in a shorter
    panel, then a taller grid, is three layouts for one navigation.
  */
  pendingComponent: CalendarPending,
});

function CalendarPage() {
  return (
    <div className="space-y-8">
      <CalendarHeader />
      <CalendarDayFlow heading="Schedule" />
    </div>
  );
}
