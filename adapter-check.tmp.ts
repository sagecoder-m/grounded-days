import { toDayFlowEvent, fromDayFlowEvent, buildCalendarTypes } from "@/lib/dayflow-adapter";

const timed = {
  id: "e1",
  title: "Timed event",
  date: "2026-08-24",
  startsAt: "2026-08-24T14:00:00.000Z",
  endsAt: "2026-08-24T15:00:00.000Z",
  allDay: false,
  area: "personal",
  source: "local",
} as never;

const allDay = {
  id: "e2",
  title: "All day event",
  date: "2026-08-25",
  allDay: true,
  area: "professional",
  source: "local",
} as never;

const synced = {
  id: "e3",
  title: "Synced event",
  date: "2026-08-26",
  startsAt: "2026-08-26T09:00:00.000Z",
  endsAt: "2026-08-26T09:30:00.000Z",
  allDay: false,
  source: "google",
} as never;

for (const [label, ev] of [["timed", timed], ["allDay", allDay], ["synced", synced]] as const) {
  const df = toDayFlowEvent(ev);
  console.log(`--- ${label}`);
  console.log("  calendarId:", df.calendarId);
  console.log("  allDay:", df.allDay);
  console.log("  start ctor:", df.start?.constructor?.name, "value:", String(df.start));
  console.log("  end   ctor:", df.end?.constructor?.name, "value:", String(df.end));
  try {
    console.log("  roundtrip:", JSON.stringify(fromDayFlowEvent(df)));
  } catch (err) {
    console.log("  roundtrip THREW:", (err as Error).message);
  }
}

console.log("--- calendars with one google connection");
console.log(
  JSON.stringify(
    buildCalendarTypes([{ id: "c1", provider: "google" } as never]).map((c) => ({
      id: c.id,
      readOnly: (c as { readOnly?: boolean }).readOnly ?? false,
    })),
  ),
);
