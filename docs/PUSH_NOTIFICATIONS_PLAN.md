# Push notifications for grounded

## Context

Grounded has no notification of any kind. A due time added to an assignment is only
seen by someone who opens the app, and a focus timer that finishes while the tab is
in the background is silent — `focus-timer.tsx` already carries a comment saying the
chime is refused when backgrounded, so this is a known, documented gap.

The hard part of this feature is not delivery, it is restraint. `docs/FIELD_GUIDE.md:15`
states the premise — *"No streaks, no shaming, nothing scored… Anything that reads as a
report card is a bug"* — and `docs/barktank/01-introduction.md` already contains a written
notification policy that resolves most design questions:

> **The rule: notify about the calendar, never about the person.**
> Ships — an event starting soon, an assignment due tomorrow, a focus session ending.
> Never ships — anything triggered *by* absence, any streak, any accumulating badge.

This plan implements exactly what that policy permits, and nothing else.

**Decided with the user:**
- Build: focus timer finished · task due (covers assignments *and* personal tasks) · morning one-thing line
- iOS: make grounded installable, accepting that Home Screen install is required for push
- Motivation lives in the morning line, not in behaviour-triggered nudges — the rule stands
- Every type **off by default**, per the policy

**Deliberately not in scope** (cheap to add later on the same machinery, not requested):
event-starting-soon, and a "calendar stopped syncing" alert.

---

## Prerequisite: make grounded installable

There is currently zero PWA plumbing — no manifest, no service worker, no icons, no
`apple-touch-icon`, no PWA dependency (confirmed across `public/`, `package.json`,
`vite.config.ts`, `src/routes/__root.tsx`). iOS/iPadOS only delivers web push to a
home-screen-installed web app, so without this there is no push on the devices that
matter most here.

- `public/manifest.webmanifest` — name, short_name `grounded`, `display: "standalone"`,
  `theme_color` / `background_color` from the cream ground, `start_url: "/"`.
- `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png`,
  `public/apple-touch-icon.png` — the sprout mark on the sage circle already used as the
  brand in `src/components/app-shell.tsx`.
- `src/routes/__root.tsx` — its `head.links` array currently holds only the stylesheet and
  the favicon. Add `rel="manifest"`, `rel="apple-touch-icon"`, and the
  `apple-mobile-web-app-capable` / `-status-bar-style` / `-title` and `theme-color` meta.

**Keep the service worker dumb.** `public/sw.js` handles `push` and `notificationclick`
only — no precaching, no offline shell. This app is SSR through TanStack Start and a
caching worker would serve stale HTML, which is a much worse bug than having no offline
mode. Register it from a small `src/lib/use-push.ts`.

---

## What gets built

### 1. Focus timer finished — client only, no backend

The smallest useful piece and the only one that needs no server at all. Ship it first.

In `src/components/focus-timer.tsx`, the focus-end branch (around L66–98) already logs the
session, tries a WebAudio chime and raises a toast. Add: when `document.hidden` and
permission is granted, show a notification through the service worker registration. Keep
the chime and toast for the foreground case.

Offer permission **inline at the moment it makes sense** — a "tell me when it's done" line
beside the timer controls, not a prompt on page load. A permission dialog fired on arrival
is the fastest way to get permanently denied.

### 2. A task's due time — covers assignments and personal alike

One feature, not two. A task with `date` + `dueTime` (added in
`20260831230000_assignment_due_time.sql`) gets one notification, a few hours before the
time, once. The area only decides what the line says: an Education task names its course
via `courseForEvent`/`courseTag` in `src/lib/course-match.ts`; a Personal one just names
itself.

```
OPAN 6605 · Problem Set 3          Book the dentist
Due at 11:59 PM tonight.           Due at 5:00 PM today.
```

Never the deadline minute itself — by then it cannot change anything.

### 3. The morning line — opt-in, off by default

One sentence at a time the person picks. Reuses `pickOneThing(state, skipped)` from
`src/lib/user-insights.ts` (which already ranks due/overdue → future → undated and
deliberately refuses to invent a priority), plus a line from
`src/lib/affirmations.ts`. Never a count, never a list.

---

## Supporting work

### Timezone — the sharpest technical problem

Due times are stored timezone-naive on purpose (`store-types.ts:26`), and **nothing in the
database knows what timezone anyone is in** — there is no such column anywhere, and no
`Intl.DateTimeFormat` call in the codebase. A server cron therefore cannot know when
"11:59 PM local" or "8:00 AM" actually is.

Add `timezone text` to `user_settings`, capture `Intl.DateTimeFormat().resolvedOptions().timeZone`
on app load and write it when it differs. Fall back to `UTC`. Without this, nothing else
in this plan can be scheduled correctly.

### Subscriptions

New `push_subscriptions` table: `user_id`, `endpoint` (unique), `p256dh`, `auth`,
`user_agent`, `created_at`, `last_seen_at`, `failure_count`. RLS scoped to the owner, same
shape as the existing per-user tables in `20260731090000_normalize_relational_schema.sql`.

A subscription is per-device, so the same person can have several. Prune on a `410 Gone`
from the push service — that is the browser telling you the subscription is dead.

VAPID keys as function secrets (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`);
the public key also needs to reach the browser, so it goes in Vercel env as
`VITE_VAPID_PUBLIC_KEY` — it is public by design.

### Preferences

Extend `Settings` in `src/lib/store-types.ts` with `notifyTimer`, `notifyTaskDue`,
`notifyMorning` (all `false`) and `notifyMorningAt` (`"08:00"`). Thread each through the
three places a setting must touch: `rowToSettings` and `settingsPatchToRow` in
`src/lib/db/mappers.ts`, and `DEFAULT_SETTINGS` in the same file.

UI goes in `src/routes/profile.tsx` as its own section, following the established pattern:
a `card-soft` section, a serif `h2`, and **option-card buttons rather than switches** —
there is no `<Switch>` in use anywhere in the app today, and binary settings are expressed
as two buttons (see `ThemeSection`, `DensitySection`). Also update the settings table in
`docs/FIELD_GUIDE.md:239`, which claims every setting is listed there.

### The sender

New edge function `supabase/functions/send-notifications/index.ts`, using the existing
`_shared/supabase.ts` helpers (`serviceClient`, `jsonResponse`, `requireEnv`).

Scheduled by extending `ops` from `20260905010000_scheduled_calendar_sync.sql` — that
migration already established the whole pattern: `pg_cron` + `pg_net` + the service key in
Vault + a locked-down `ops` schema. Add `ops.run_send_notifications()` beside
`ops.run_calendar_sync()` and a `*/15 * * * *` job.

**Dedupe is not optional.** A `notifications_sent` table with a unique constraint on
`(user_id, kind, ref_id, for_date)`, checked before send. Without it every cron tick
re-notifies the same deadline, which is the single fastest way to make someone disable
notifications forever.

---

## Guardrails

`src/lib/notification-copy.ts` — pure functions producing every string, so the words are
testable in isolation.

`src/lib/notification-copy.test.ts` — mirror the vocabulary test that already exists at
`src/lib/share-summary.test.ts:47`, which asserts generated text never contains `overdue`,
`late`, `missed`, `failed`, `behind`, `streak`, `should`, `only`, `struggling`, `poor`.
Extend the list for this surface with `don't forget`, `you haven't`, `still`, `again`.
This is the regression that a later well-meaning edit reintroduces, because the sentence
always reads fine to whoever is writing it.

Two hard rules to encode:
- **No badge counts.** `docs/barktank/01-introduction.md` is explicit: a badge showing 14 is
  a tally of a hard fortnight sitting on the home screen. Notifications carry no badge.
- **Nothing from the journal**, ever — same rule the assistant and share links follow.

---

## Order of work

1. Manifest, icons, meta, dumb service worker → app is installable
2. Timer notification → first real value, no backend, verifiable alone
3. Timezone capture + `push_subscriptions` + preferences UI
4. `send-notifications` function + `notifications_sent` dedupe + cron
5. Copy module and its vocabulary test

Steps 1–2 are independently shippable and worth landing before 3–5 begin.

---

## Verification

- **Installable**: Lighthouse PWA audit passes; on the iPad, Share → Add to Home Screen
  produces an icon that opens full-screen without Safari chrome.
- **Timer**: start a 1-minute block, switch to another app, confirm the notification
  arrives — this is the case the current chime demonstrably fails.
- **Due time**: set a task due two hours out, run `select ops.run_send_notifications();`
  by hand, confirm one notification and exactly one `notifications_sent` row. Run it twice
  more and confirm no second notification — the dedupe is the thing being tested.
- **Timezone**: check the stored value matches the device, and that a task due 11:59 PM
  local is not scheduled off UTC.
- **Morning line**: set the time to a few minutes out, confirm one sentence naming one
  thing, with no count in it.
- **Copy**: `npx vitest run src/lib/notification-copy.test.ts`.
- **No regressions**: full gate — `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`
  (67 tests currently pass), `npm run build`.
- **Off by default**: sign in as the demo account and confirm no permission prompt appears
  and no notification is ever sent without a preference being switched on.
