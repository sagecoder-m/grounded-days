# grounded — Field Guide

Every feature in the app, what it is called, and where to find it. Written as the
vocabulary first, then the map.

- **Current as of:** September 2026
- **Live version:** https://claude.ai/code/artifact/7a76e4c6-0c65-4d3a-a83b-e9b3ce86b5f2
- **Scope:** the shipped product, not the roadmap. Labels are quoted from the app, and
  the widget defaults were read out of `src/lib/db/mappers.ts` rather than remembered.

---

## The one rule that shapes everything

**No streaks, no shaming, nothing scored.** There is no streak to break anywhere in the
product, absence is never counted, and no screen tells you that you did badly. This is
not a tone preference — it is the premise. Anything that reads as a report card is a bug.

**The journal is never shared with anything.** The assistant is not given journal entries,
moods, gratitude lines or handwritten pages. It plans from goals, schedule, habits and
tasks only. Share links carry no journal content either.

---

## Navigation

Eight destinations, grouped three ways. The side rail shows the groups; the top-tab layout
shows the same order as icons.

| Group | Destinations |
| --- | --- |
| Day to day | Overview `/`, Journal `/journal` |
| Your areas | Personal `/personal`, Professional `/professional`, Education `/education` |
| Tools | Calendar `/calendar`, Assistant `/assistant`, Profile `/profile` |

Layout is chosen in Profile: **Side rail** (collapsible to icons) or **Top tabs**. Narrow
screens always get the top bar — a sidebar on a phone is a drawer nobody opens.

---

## Overview `/`

> "Take a breath. Here's your gentle rundown for today."

A freeform board. Widgets sit where you put them and stay there.

### Widgets

| Widget | Default | What it is |
| --- | --- | --- |
| Greeting & date | **On** | The date and a greeting using your display name. Furniture, not a widget — it cannot be moved, resized or switched off. |
| A look at today | **On** | Today only. Events and to-dos for the day in front of you. Shows what fits, then "+4 more". Assignments carry their course and due time. |
| Upcoming | **On** | The next few days across all areas, grouped by day. Shows what fits, then "+2 more days". |
| Focus timer | **On** | One stretch of work. Also full-size on Education. |
| Your rhythm | **On** | Activity over time, as a flowing band. |
| Where your attention went | **On** | The balance between the three areas, as a ring. |
| **To do** | Off | The one widget you fill in yourself — undated tasks in a plain list. |
| **Agenda** | Off | The next fortnight as one continuous run. |
| Two-week chart | Off | A fortnight of activity as a chart. |
| Area progress | Off | The three areas as progress cards. |
| Rhythm grid | Off | Up to twelve weeks of days as shaded squares. |
| How it's been going | Off | Recent progress in plain words rather than a chart. |

### To do — the exception on the board

Every other widget is *derived*: it shows data entered somewhere else. To do is the only
one you write into. It holds **undated** tasks, so it never repeats what today's list
already shows — give one a date later and it moves onto the calendar by itself. Finished
items stay until you press "Clear N done", because watching something vanish the instant
you tick it removes the satisfying part.

### Also on the Overview

- **Just one thing** — a link beside "A look at today". Clears the screen to a single task
  when the list itself is the obstacle. Appears only while something is unfinished.
- **First thing** — what a brand-new account sees instead of an empty board, with the
  option to look around first. It waits for data to load before deciding, so an
  established account never sees it.
- **Waiting a while** — a quiet, dismissible prompt about tasks sitting untouched.

### Arranging the board

| To do this | Do this | Notes |
| --- | --- | --- |
| Move a widget | Drag the grip in its top-left corner | Only the grip moves it, so checkboxes, links and titles inside stay live. |
| Resize a widget | Pull any edge or corner | All eight. Each widget stops at a minimum size rather than breaking. |
| Add a widget | "Add a widget", above the board | Lists only what is off. Arrives below everything else. |
| Remove a widget | The ✕ in its top-right corner | Hidden, never deleted — it returns to the Add menu. |
| Start over | "Reset layout" | Restores positions. Which widgets are on stays your choice. |

A widget will not land on an occupied spot — it stays where it was rather than shoving a
neighbour aside, so the board keeps the shape you gave it.

---

## Journal `/journal`

> "A few words is enough."

One entry per day. No prompts you have to answer, no streak to keep.

- **Type or Handwrite** — a switch above the entry, on a tablet. Either way it is the same
  day's entry; swapping back keeps what is already there.
- **Mood** — one of five: low, tender, steady, good, wired. Shown as a coloured dot.
- **Gratitude** — a separate line from the entry body.
- **This week** — the past seven days with each day's mood.
- **Entries** — recent entries as first lines. Full archive at `/journal/all`.

### Writing by hand

Writing needs a **tablet**; reading needs nothing. A handwritten page opens on a phone and
a laptop too — an entry you cannot read back is an entry you have lost.

| Control | What it does |
| --- | --- |
| Write | The pen. **Pencil only** — a finger leaves no mark, so a resting hand cannot write by accident. |
| Erase | Rubs out what the pen put down. An erase can be taken back by Undo. |
| Undo / Redo | Steps back and forward through strokes. A new mark ends the redo trail. |
| Clear | Empties the whole sheet, including anything loaded from an earlier session. |
| More room | Adds another page below. As many as you like; nothing already written moves or rescales. |
| Fingers | One finger scrolls, two pinch to zoom. Since only the Pencil draws, touch is free to navigate. |

The sheet is **college ruled** — 7.1 mm between lines, with a margin down the left. In dark
mode the ink shows light against the dark page, but what is *stored* is always dark ink, so
a page written at night is still legible in the morning and the other way round.

Not Apple's Markup — Safari does not expose Markup or PencilKit to a web page. This is a
canvas using the pen input underneath: `pointerType` for palm rejection, `pressure` for
stroke width, coalesced events for smooth fast strokes.

---

## Areas

Three lives kept apart on purpose. Each has a colour used consistently for its chips and
progress bars everywhere in the app.

### Personal `/personal` — sage

> "Tend to yourself."

- **Daily habits** — small repeating things, with day-of-week initials across the top.
- **Consistency, over time** — how steadily habits have been kept. A picture, not a score.
- **Goals** — checklists of steps, with the habits that feed them underneath.
- **Anything else** — personal projects that do not fit a habit or a goal.
- **Section chips** (phone) — Consistency · Habits · Tasks · Goals.

### Professional `/professional` — brown

> "Your work, organized softly."

- **Projects** — each opens its own page at `/professional/<id>` with tasks and sub-projects.
- **Where you left off** — the thread you were last pulling on.
- **On your calendar** — work events in the next seven days. Synced events appear here too,
  filed by the area you gave their calendar.

### Education `/education` — clay

> "Learn at your own pace."

- **Today** — what is due today and what is happening today, in one list. Classes synced
  from a university calendar appear here, and every row says which course it belongs to.
- **Course codes** — an assignment shows its course as a chip (`OPAN 6605`). A class shows
  one read from the synced title. If the title names no course, nothing is guessed.
- **Due times** — an assignment can carry a clock time as well as a date. Today's list and
  the agenda order by it, so a 9am deadline stops sorting below a midnight one.
- **Due this week** — the next seven days of assignments.
- **Courses** — each holds its own assignments. Notes fold away behind "Details".
- **Goals** — study goals as step checklists.
- **Focus timer** — full-size, where the studying happens.
- **Section chips** (phone) — Today · This week · Courses · Goals.

---

## Calendar `/calendar`

> "Your calendar."

- **Five views** — Day, Week, Month, Year, Agenda. A phone drops Year (twelve month grids in
  a narrow column is unreadable) and opens on Day.
- **Assignments on the grid** — a dated task appears as an all-day entry reading
  `☐ OPAN 6605 · Problem set 3 · 11:59 PM`. The course comes first because a narrow week
  column truncates from the right.
- **Drag to create** — drag across empty time to make an event.
- **New event** — right-click, or press and hold on a phone.
- **Synced events** — imported from Google or Outlook, read-only. They take the area you
  gave that calendar, which is why they also appear on area pages.

---

## Assistant `/assistant`

> "Think it through with me."

- **Chats down the side** — past conversations in a rail beside the current one, with a date
  under each and a bin on hover. A phone keeps them behind the "Chats" menu.
- **Stop** — Send becomes Stop while a reply is coming, and cancels it.
- **Try again** — a failed reply retries without making you retype anything.
- **Copy a reply** — on every answer.
- **Course codes** — "add assignments for OPAN 6605" works, and so does "6607 and 6608" once
  a prefix is established. A bare number matching two courses prompts a question rather than
  a guess.
- **Reading a photo** — attach a syllabus, whiteboard or printed timetable and it extracts
  dates and times into assignments.
- **Tone** — Gentle · Neutral · Direct. **Length** — Brief · Balanced · Thorough. Both in Profile.

It can create tasks and courses. It cannot see the journal.

---

## Sharing

A share link is built for a therapist, a partner or a parent — someone who wants to know
how the last couple of months have gone and where a question might help.

| On the shared page | What it shows |
| --- | --- |
| The reading | Two or three plain sentences: how much was finished, where goals are underway, and the one area with work sitting past its date. |
| The last few weeks | How much was finished each week, split by area. Quiet weeks are kept in. |
| Where things stand | Each area's finished count beside its waiting count. |
| Goals | The ones that are moving, then a count of those written down and not started. |
| Coming up | The next couple of weeks, capped and at the bottom. |

Written to be safe to open **in front of the person it describes**, who is usually the first
to open it:

- Work past its date is called **waiting**, never overdue. The work is waiting; the person
  is not failing.
- Nothing absent is ever counted — six finished things is six finished things, not 60% of ten.
- The area worth a conversation is marked "worth asking about" in its own colour, not red.
- A quiet stretch is described as a stretch, not a verdict.

---

## Profile & settings `/profile`

Every setting lives here. Nothing is buried elsewhere.

| Setting | What it does | Options |
| --- | --- | --- |
| Display name | The name used in your greeting | Free text |
| Light or dark | The overall theme. Changes behind a soft blur | Follow my device · Light · Dark — **Light by default** |
| Accent color | The highlight colour used throughout | Sage · Clay · Brown · Tan |
| Navigation | Where the tabs sit | Side rail (collapsible) · Top tabs |
| Density | Scales the whole interface, like zooming out | Comfy · Compact |
| Default calendar view | Which view the Calendar opens on, wide screens | Week · Month · Year |
| Week starts on | First column of every week view, and the habit grid | Monday · Sunday · Saturday |
| Your assistant | Tone and reply length | See Assistant |
| Overview widgets | Which widgets are on the board | A switch each — position and size are set on the board |
| Calendar connections | Connect Google or Outlook, choose each one's area, re-sync | Read-only import |
| Share links | A view-only summary of chosen areas, with an expiry | Revocable at any time |
| Passcode | A six-digit lock over the app on this device | Show/hide while typing |
| Data | Export or clear what grounded holds | — |

---

## On a phone

A phone gets a shorter, calmer version of the same app rather than a squeezed copy of the
desktop one. Nothing is missing; some of it is folded.

| What changes | Why |
| --- | --- |
| Widgets stack by purpose | Today and what is coming first, then tools, then charts — action before reflection, the order a day is lived in. A board has no reading order; one column forces one. |
| Lists get a height budget | Today and Upcoming show what fits and say how much they left out, instead of eleven to-dos one after another. |
| "Looking back" | The charts fold into one tappable line, so the scroll ends after the day's own work. Closed every time you arrive. |
| Section chips | Personal and Education get a jump list, so reaching Goals does not mean scrolling past everything. |
| One-line greeting | It was spending most of the first screen on a sentence the screen below could not keep. |
| Calendar opens on Day | A week grid at 375px puts half the week off-screen behind a sideways swipe. |

---

## Glossary

**Agenda** — the next fortnight as one continuous run rather than day boxes. *Overview
widget, and a Calendar view.*

**Area** — one of the three lives grounded keeps separate: Personal, Professional,
Education. Every task, goal and event belongs to exactly one. *The three area tabs.*

**Assistant** — the chat that helps you plan. Reads goals, schedule, habits and tasks;
never the journal. *Assistant.*

**Board** — the Overview as a workspace. Widgets stay where you put them; moving one never
moves another. *Overview.*

**Connection** — a linked Google or Outlook account, with an area you choose. Import is
read-only; grounded never writes back. *Profile → Calendar connections.*

**Course** — a class holding its own assignments. Its code (`OPAN 6605`) is what the app and
the assistant both use to name it. *Education → Courses.*

**Daily habit** — a small repeating thing, ticked per day. No streaks; nothing is lost by
missing one. *Personal → Daily habits.*

**Due time** — the clock time a task is due, alongside its date. Stored as wall-clock time,
so 11:59pm stays 11:59pm wherever you open it. *Any task, beside its due date.*

**Event** — something happening at a time. It happens to you, so it has no checkbox.
*Calendar, and each area's "On your calendar".*

**Focus timer** — a timer for a single stretch of work. *Overview widget, and Education.*

**Goal** — a checklist, not a dial. The percentage comes from how many steps are ticked, so
you never judge "how far along do I feel". *Every area page.*

**Gratitude** — a line in the day's journal entry, kept separate from the entry itself.
*Journal.*

**Grip** — the handle at a widget's top-left corner, and the only thing that moves it, so
everything inside stays clickable. *Every widget except the greeting.*

**Handwriting** — a journal entry written with an Apple Pencil on a college-ruled page.
Written on a tablet, readable everywhere. *Journal → Handwrite.*

**Just one thing** — strips the screen back to a single task when the whole list is the
problem. *Overview, beside "A look at today".*

**Looking back** — the line on a phone that folds the charts away. Closed on arrival, every
time. *Overview, on a phone.*

**Mood** — one of low, tender, steady, good, wired, attached to a journal entry. *Journal.*

**Passcode** — six digits locking the app on this device, with a show/hide toggle.
*Profile → Passcode.*

**Project** — a body of work with tasks under it. Professional projects get their own page;
Personal ones live under "Anything else". *Professional, Personal.*

**Reset layout** — restores the starting arrangement. Positions only; which widgets are on
stays as you set it. *Overview, above the board.*

**Rhythm** — activity over time. A flowing river, a grid of shaded days, or a two-week
chart — the same idea, three pictures. *Overview widgets.*

**Share link** — a view-only summary of chosen areas, with an expiry. Carries no journal
content and can be revoked at any time. *Profile → Share links.*

**Step** — one tickable item inside a goal. Ticking steps moves the goal's percentage.
*Inside any goal card.*

**Task** — something you do, so it has a checkbox, with an optional due date and time.
*Every area page.*

**To do** — the one widget you write yourself: undated tasks in a plain list. *Overview
widget.*

**Waiting** — what a share link calls work sitting past its date. Deliberate wording: the
work is waiting; the person is not failing. *A shared summary.*

**Widget** — one panel on the board. Move by its grip, resize from any edge, switch on or
off in Profile. *Overview, Profile → Overview widgets.*

---

## Stack, for context

- **Hosting** — Vercel, at `grounded-days.vercel.app`
- **Backend** — Supabase: Postgres with row-level security, auth, storage, edge functions
- **Assistant models** — OpenRouter, currently the free model chain
- **Calendar rendering** — DayFlow
- **Error reporting** — written into a `client_errors` table in Supabase rather than sent to
  a third party

Storage buckets: `assistant-uploads` (images sent to the assistant) and `journal-ink`
(handwritten pages). Both private, scoped per user, read through signed URLs.
