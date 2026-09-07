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

### Mulanga — founder, product, the pitch, and the buyer

Owns the narrative, the Bark Tank application and the pitch itself. Continues to own
product decisions.

**Also owns the buyer conversations** — therapists, coaches and Georgetown wellness staff —
because that is the half of the story we cannot fake and it is not a task to hand to
whoever has capacity. Runs the outreach to Georgetown wellness and to faculty.

*What success looks like by 22 September:* nomination and application in, three provider
conversations held and written up, and one quotable sentence from a licensed clinician.

### Kamillah Ismail — evidence

**Not a feature role, and that is the point.** Owns recruiting and running the pilot:
getting 30+ testers in, building the pre-use survey and consent, chasing completion, and
turning what comes back into numbers we can put on a slide. Owns the tester spreadsheet
and the weekly count.

*What success looks like by 22 September:* 15–20 people actively using it, with a first
read on whether they come back.

### Jack Hamilton — technology

Oversees the tech: the codebase, the deploys, and the fixes that pilot testing surfaces.

**With one constraint worth stating out loud: build only what produces evidence.** The
admin console so we can see signups and activity, the measurement of return visits,
onboarding good enough for a first-time tester who is not the founder, and the bugs 30
testers are about to find. Everything else waits until November.

*What success looks like by 22 September:* we can answer "how many people used it this
week" from a screen rather than a query, and no tester has been blocked by a bug for more
than a day.

### The tension in this split, named

With Jack on tech, only one of the three of us is full-time on evidence. That is a real
cost and we should say it rather than discover it in October.

Two things make it survivable. The measurement work is genuinely on the critical path —
we cannot report retention we are not recording — so the tech role is serving the
bottleneck rather than avoiding it. And the buyer conversations sit with Mulanga, where
they are least likely to be deprioritised.

What we should watch for: the week Jack's list becomes features rather than instrumentation.
If that happens, it is a decision to make in the open, not a drift.

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

One open question, discussed in the application prep and not yet settled:

**Do we lead with the consumer app or with the clinical buyer?** The eventual product is
both — the therapist view needs a good client app, and the client app is more valuable
because it can be shared. What is not yet decided is which one goes first in the pitch,
and the two need different evidence collected in the next 17 days.

That decision needs making by **10 September** so the pilot collects the right things.
