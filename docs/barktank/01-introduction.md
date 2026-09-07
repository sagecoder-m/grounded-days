# grounded — where we are, and who is doing what

An introduction for the two people joining, and for anyone reading the Bark Tank
application. Written in the same voice as the product: plainly, without overstating
what exists.

- **Prepared:** 5 September 2026
- **Companion documents:** [Field Guide](../FIELD_GUIDE.md) · [Architecture](https://claude.ai/code/artifact/f8bf36f2-e726-4ebb-a1bf-21bd3819e4cc) · [Application prep](./02-application-prep.md) · [Pitch](./03-pitch.md)

---

## What grounded is

A calm place for people with different brains to readjust, organize and grow — across
personal life, work and study.

Not an app for a diagnosis. People differ in how they organize, how they start work and
what keeps them going, and grounded adapts to the person in front of it rather than
assuming one style fits everyone. Nobody is asked to name a condition to use it, and
nothing in the product assumes one.

The premise is a subtraction. Every habit app on the market is built on streaks, scores
and completion percentages, and every one of them makes a bad week visibly worse. grounded
has none of those. No streak to break. No percentage of days. Nothing counted that is
absent. That is not a tone preference; it is the product.

Four things follow from it, and they are the things worth defending:

1. **Patterns, never labels.** The assistant describes what it observes — "large projects
   seem easier for you once split into smaller actions" — and never what that means about
   the person. This is written into the system prompt as a rule, not left to tone.
2. **Absence is never counted.** Six finished things is six finished things, not 60% of ten.
3. **The journal is never given to the AI, or to anyone you share with.** Enforced in code
   by an explicit deny list, not by policy.
4. **A shared summary is safe to open in front of the person it describes** — because they
   are usually the first to open it. Work past its date is *waiting*, never *overdue*.

## Where it actually is today

Honest state, not the pitch version.

| | |
| --- | --- |
| **Live** | `grounded-days.vercel.app`, deployed continuously from `main` |
| **Real usage** | One daily user (the founder) with roughly 130 calendar events, 10 goals, journal entries, two synced calendars |
| **Pilot testers** | One, informally. This is the weakest number in the whole venture |
| **Revenue** | None. No pricing exists in the product |
| **Running cost** | **Unconfirmed.** Today's actual spend has never been added up. ~$171/month is the *projected* stack for a team of three — and $50 of that is a budget for paid AI models we are not yet using |
| **Tests** | 67 automated, covering the analytics, the sharing vocabulary, and the load-order bugs |

**What works well:** the daily loop, the calendar with Google and Outlook sync, the
assistant reading a syllabus into assignments, handwritten journal entries on an iPad, and
the share summary.

**What is thin:** the admin console, onboarding for a first-time user who is not the
founder, and anything to do with money.

**What is unverified:** the iPad handwriting has been tested by one person on one device.
Nothing has been tested by anyone who did not build it.

### Known bugs, as of 7 September

| What | Status | Note |
| --- | --- | --- |
| Calendar reverted to light on open, in dark mode | **Fixed** — `4595bd0` | DayFlow resolves event colours in JavaScript from a theme mode that defaults to light, and we only told it in an effect — which runs after the first paint. Now set on the constructor. Not the load-order bug behind the earlier flashes; that one was already gated |
| Overview page across phone, tablet and desktop | Open | **The one bug that is also a pilot risk.** It is the first screen every tester meets, on whatever device they own, and 30 people arrive on three device classes on the 13th. Needs scoping before it can be estimated |

**One number to fix this week.** What we actually spend today, from the billing pages —
Supabase, Vercel, Google Workspace, GitHub, the domain. It takes twenty minutes and it is
the kind of figure a judge asks for offhand. Do not carry the projection into the
application as if it were the bill.

---

## The team

Three people. The split below is deliberate and is probably not what you expect.

> **The bottleneck is not engineering.** The product works. What we do not have is
> evidence: **users, a buyer, and a price.** Putting two people on features between now
> and November would be the most comfortable mistake available to us.

### Mulanga — pitch, buyer, and implementation

Owns the narrative, the Bark Tank application and the pitch itself. Continues to own product
decisions.

**Owns the buyer conversations** — therapists, coaches and Georgetown wellness staff — because
that is the half of the story we cannot fake, and it is not a task to hand to whoever has
capacity.

**And owns implementation**, by prompting Claude with Jack reviewing. That is a workable way
to build at this size, and it is what makes the review role below worth having.

*Success by 22 September:* nomination and application in, three provider conversations held
and written up, one quotable sentence from a licensed clinician, and onboarding a stranger can
get through.

### Jack Hamilton — backend review

**Reviews rather than builds.** The data model, the RLS policies, the migrations, and above
all the boundary that keeps the journal out of the assistant and out of every share payload.

This is a better use of a second technical person than a second pair of hands would be. Thirty
strangers are about to hold accounts in this database; the failure that matters is not a
missing feature, it is one person's journal reachable from another person's session. That is a
reading problem, not a writing one.

*Success by 22 September:* every change that touched the schema has been read by someone who
did not write it, and the journal-isolation test still passes.

### Kamillah Ismail — evidence

**Not a feature role, and that is the point.** Owns recruiting and running the pilot: getting
30+ testers in, building the pre-use survey and consent, chasing completion, and turning what
comes back into numbers we can put on a slide. Owns the tester spreadsheet and the weekly
count.

*Success by 22 September:* 15–20 people actively using it, with a first read on whether they
come back.

### The capacity problem, named

With Jack reviewing rather than building, **Mulanga now holds three roles** — the pitch and
application, the buyer conversations, and implementation. Kamillah holds evidence. Nobody is
redundant anywhere, and there is no slack in the plan.

The prediction is easy to make, so it is worth making in writing:

> **When building and provider outreach compete for the same evening, outreach is what
> slips.** It has no deadline that bites, no visible failure state, and nobody notices for a
> fortnight. It is also the one item on the list that cannot be done later — three
> conversations written up by 22 September means the first emails go out this week.

**Proposed mitigation.** Kamillah or Jack takes the *scheduling* half of outreach: build the
list of 15, send the emails, book the slots. Mulanga still runs the conversations — they need
the founder in the room — but does not also have to chase them. Decide by Monday 8 September.

**The second thing to watch:** the review role only works if review is a gate, not a courtesy.
If changes ship because Jack has not got to them yet, we have a solo builder and an observer.
Agree what needs review before it merges and what does not — schema and RLS yes, copy and
styling no.

### Fill this in before sending

- [ ] Georgetown affiliation and graduation year for Kamillah and Jack (Bark Tank eligibility)
- [ ] What each has done before that makes them credible in the role — one line each, for the
      "why us" slide
- [ ] Equity or credit expectations, agreed in writing, before the application goes in
- [ ] Confirm Kamillah and Jack have both read this document and agree to the split

---

## How to get oriented

**Read in this order.** Each is short.

1. **[Field Guide](../FIELD_GUIDE.md)** — every feature, what it is called, where it lives.
   The vocabulary first. Read this before touching the app so the words we use mean the
   same thing to all three of us.
2. **[Architecture](https://claude.ai/code/artifact/f8bf36f2-e726-4ebb-a1bf-21bd3819e4cc)** —
   six diagrams: the system map, the trust boundaries, the data model, calendar sync, the
   public endpoints, and what the assistant is allowed to see.
3. **[Application prep](./02-application-prep.md)** — the strategy, the plan to 22
   September, and the questions we will be asked.

### Is there a PRD?

No, and deliberately. A PRD says what we are going to build and why; the field guide says
what exists. For the next nine weeks the answer to "what are we building and why" is the
application prep document — the scope is the competition. Writing a separate PRD now would
produce a fourth document that moves no evidence.

We should write one in November, when we know who the buyer is.

---

## How we work

**Say the true thing.** If a number is soft, mark it soft. If something has not been
tested, say so. Half of what has gone wrong in this codebase went wrong because something
plausible was assumed instead of checked — three separate visible bugs came from acting on
a default before the real data arrived. The same discipline applies to the pitch: a claim
we cannot support is a question we will be asked.

**The repo is the source of truth.** `main` deploys to production on push. Migrations live
in `supabase/migrations/` and are applied through the Supabase dashboard.

**The privacy rules are not negotiable.** The journal never reaches the assistant or a
share link. If a change would touch that, it stops and comes to the whole team.

---

## What we are actually deciding

Four open questions. The first is the oldest and most consequential; the others arrived this
week.

### 1 · Consumer app or clinical buyer first?

The eventual product is both — the therapist view needs a good client app, and the client app
is more valuable because it can be shared. What is not decided is which goes *first* in the
pitch, and the two need different evidence collected in the next fortnight.

**By 10 September**, so the pilot collects the right things. Discussed in the application prep.

### 2 · Does the pitch lead clinician-first?

The intent is for grounded to read as built *for* clinicians receiving updates about the people
they see. That is right, and it is already where the wedge points: the practice pays, the
client seat is free, and the shared summary is the product.

**Separate the pitch from the build.** The pitch can lead clinician-first immediately and costs
nothing to change. The clinician *surface* is three phases of the spec that the build-scope
brief recommends deferring until a provider has said what they want — a recommendation that
does not change because the framing does.

*Pitch it as where we are going; demo what exists.* A judge who asks to see it gets the share
link and an honest "the roster view is what this funding builds." That beats a dashboard built
for nobody.

### 3 · Who schedules the provider conversations?

See the capacity problem above. **By Monday 8 September.**

### 4 · How much do we modernise the look?

Worth doing, and worth being careful about, because the current restraint *is* the product.
"Nothing scored, nothing that makes a bad week worse" shows up visually as an absence of
badges, meters, progress rings and colour-coded urgency. A modernisation that adds visual
energy would undo the argument the pitch rests on.

**Safe to change:** type scale and rhythm, spacing consistency, card treatment, motion on
transitions, focus and hover states, board density, dark-mode contrast. Craft, not semantics.

**Not up for change:** anything introducing a score, a percentage, a streak, a red state, or a
comparison against what was possible.

**On timing** — this has the weakest claim on the next seven days. It produces no evidence and
nobody leaves a pilot over type scale. Scope it now, do it in the **25–31 October** window: the
deck gets built that week and will be full of screenshots, which is when a visual pass pays.
