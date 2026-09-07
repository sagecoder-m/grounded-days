# Bark Tank — application prep

The strategy, the plan to 22 September, and the questions we will be asked.

- **Prepared:** 5 September 2026
- **Nominations close:** 13 September — **8 days**
- **Applications close:** 22 September — **17 days**

---

## The one sentence that matters

> **Our bottleneck is evidence: users, a buyer, and a price.**

Not the product. The product works — it is deployed, it syncs two calendars, it reads a
syllabus into assignments, it takes handwriting on an iPad, and it produces a summary a
therapist could read. None of that is what we are short of.

We are short of anyone who is not us using it, anyone who would pay for it, and a number
after a dollar sign. Everything in this document is organised around fixing that in 17
days.

---

## The positioning question, laid out

We want to be both a consumer wellness app and a clinical support tool. **That is the right
product strategy and a dangerous pitch structure**, and the two need separating.

### Why "both" is right

The halves need each other. The therapist view is worthless if the client app is not good
enough to open daily. The client app is more valuable because it can be shared. This is a
genuinely two-sided product, not a consumer app with a feature bolted on.

### Why "both" fails in a pitch

A judge decides who your customer is within about thirty seconds, with or without your
help. Present two and they pick one — usually the one that sounds harder to fund — and
score you on that. You do not get credit for breadth; you get judged on the weaker half.

The failure is not ambition. It is **simultaneity without sequence**.

### The resolution: wedge and expansion

Say it as an order rather than an "and":

> We start with therapists, coaches and university wellness offices, who have the acute
> problem and hold a budget. Every client they bring gets the consumer app. That is how we
> acquire consumers without paying for them.

Nothing is given up. But now there is a first market, a reason the second follows, and an
acquisition story instead of two hopes. The consumer app stops being a second bet and
becomes the distribution mechanism for the first — a far better answer to "how do you get
users?" than any ad-spend slide.

### The two orders, honestly compared

| | **Clinical first** | **Consumer first** |
| --- | --- | --- |
| Buyer | A practice, clinic or wellness office | The individual |
| Evidence needed by 22 Sept | 3–4 provider conversations, one clinician quote | 15–20 active users with a retention number |
| Achievable in 17 days? | **Yes** — a handful of emails, on campus | Harder to do *honestly*; weak numbers are worse than none |
| Precedent at Bark Tank | Adlumin, Reservoir, Hilda, Provision Surgical — all B2B | Rare |
| Risk | Longer sales cycles; "is this a medical device?" | Brutal acquisition costs in consumer wellness |
| Price you can name | A per-seat or per-practice number | Hard to justify against free competitors |

**Recommendation: lead clinical, expand to consumer.** Not because the consumer app is
worse, but because it is the more provable claim in the time we have.

**This is still open.** It needs deciding by **10 September** because the pilot has to
collect the right evidence, and switching after the application is in is much harder.

### One wording change either way

Do not say "clinical tool" in the deck. Say **"a client-shared record."** Same buyer,
without inviting the medical-device frame.

---

## The four questions we will be asked

Judges at this competition have funded a cybersecurity company and a surgical-AR company.
They will not be gentle. These are the four, with answers we can actually defend.

### 1. "Who pays you, and how much?"

**The honest position today:** nobody, and we have not set a price. That is exactly what
this pilot is for.

**The answer to give:** a practice or wellness office pays per client seat. Comparable
tools sit in the range of $8–15 per client per month, and a single therapist carrying
20–30 clients makes that a $2–5k annual account. We are testing willingness to pay in the
pilot rather than guessing at it here.

*Do not invent a number we have not tested.* "We are validating it in this pilot, and here
is what three providers told us" is a stronger answer than a confident figure with nothing
behind it.

### 2. "This is a crowded category. Why you?"

Habit trackers are crowded. **Non-shaming shared records are not.** The differentiator is
not the daily app — it is what happens when someone hands the summary to another person.

And we are not competing for "the ADHD app." We do not ask anyone to name a condition, and
nothing in the product assumes one. That widens who it is for and keeps us out of a
category where the incumbents have spent heavily.

The specific, checkable claim: our shared summary never counts absence, never uses the
word overdue, and has *unit tests on its vocabulary* so a future edit cannot quietly
reintroduce shaming language. Nobody else has built the sharing half as the product.

### 3. "Is this a medical device? What about HIPAA?"

**No, and here is why precisely.** grounded is a personal journal and planner. Its owner
may choose to share a summary through a revocable link they create themselves. We make no
diagnosis and no treatment recommendation. We are not a covered entity; the provider's own
clinical notes never enter our system.

Then the architecture answer: the journal is excluded from the AI by an explicit deny list
in code, four tables holding secrets are sealed at the database level so no client bug can
reach them, and share links store a hash of the token rather than the token.

Vagueness here reads as naivety. Precision here reads as a team that has thought about it.

### 4. "What have you actually proven?"

The weakest question for us today, which is why the next 17 days matter.

**What we will be able to say on 22 September if the plan below works:** N testers across
three continents, X% still using it in week two, three provider conversations, and one
clinician on record. **What we cannot say:** anything about revenue.

Say the second part out loud. A team that names its own gap is more credible than one that
hopes nobody notices.

---

## What to collect before 22 September

Six numbers. Nothing else is worth chasing.

| # | Metric | Target | Who |
| --- | --- | --- | --- |
| 1 | Testers signed up and onboarded | 20+ | Kamillah |
| 2 | Still active in week two | 50%+ | Kamillah, measured by Jack |
| 3 | Share links actually created | 5+ | Kamillah, measured by Jack |
| 4 | Provider conversations held and written up | 3–4 | Mulanga |
| 5 | Providers who say they would use it with clients | 2+ | Mulanga |
| 6 | A price a provider does not flinch at | 1 number | Mulanga |

Metrics 2 and 3 are the reason the tech role is on the critical path: **we cannot report a
retention number we are not recording.** Jack's first job is making 2 and 3 readable from a
screen, before there is anything to read.

**Metric 3 is the one to watch.** If people use the app but never share, the wedge is
wrong and we should know that before we build a pitch on it. That is the most valuable
thing the pilot can tell us, including if the answer is unwelcome.

---

## Week 1 · 7–11 September

**Goal: the nomination is in, and testing can start on the 13th.**

### Mulanga — the pitch and the buyer
- Get the nomination submitted — **this outranks everything else this week**
- Decide clinical-first vs consumer-first by Wednesday 10th
- Email Georgetown wellness services; email Dr. Babak Zafari, Dr. Gregory Lyon, Dr. Tommy
  Jones — introduction, what we are doing, asking for 20 minutes
- Build a list of 15 therapists, coaches and campus wellness staff to approach
- Write the outreach email and the 20-minute interview script; book two conversations for
  the following week

### Kamillah — evidence
- Build the tester list: Mulanga's contacts plus Georgetown students, into one sheet
- Write the pre-use survey and the consent text (see below)
- Write the tutorial — a first-time tester must get to a first entry without being walked
  through it
- Decide what counts as a return visit, and agree the definition with Jack before he builds
  the counter

### Jack — technology
- Admin console far enough to see signups, last-active date, and share links created
- Instrument return visits to Kamillah's definition — **this has to exist before the 13th
  or week one is unmeasured**
- Walk a first-time tester through onboarding on a device that is not yours, and fix what
  they hit
- **Ship no new features.** If something looks worth building, it goes on a November list

### End-of-week check
By Friday 11th: nomination submitted, positioning decided, survey and consent written,
tutorial drafted, tester list built, first provider conversations booked, and signups
visible on a screen.

---

## The pilot

### Who

**30+ participants, all adults 18 or over**, in two segments:

- **Georgetown students and recent alumni** — the bulk, and the market the pitch speaks to
- **10 or more outside Georgetown** — recruited beyond personal networks, spread across the
  United States, Europe and Africa

The geographic spread is worth having for its own sake, and it is also a genuinely
interesting slide: a product about calm daily rhythm tested across three continents.

### When

**Testing 13 September – 24 October. Analysis 25–31 October.**

This is a change from the original plan, and the reason matters: rehearsal is **3
November** and the finals are the **10th**. Testing to 7 November would mean rehearsing
with numbers nobody had analysed, and putting a chart on a slide the week it is due.
Closing collection on 24 October gives a full week to read the results and a week to
rehearse with them.

Checkpoints: **22 September** (application), **10 October** (mid-pilot read), **24
October** (close), **3 November** (rehearsal with final numbers).

### The survey and consent

A voluntary pre-use survey before testing.

**Optional and never required:** any mental health history, diagnosis, or related context.
Nobody has to disclose anything sensitive to take part, and we should say so in the survey
itself rather than only in the consent form.

**Light, non-clinical context we do ask for**, to segment results without requiring
disclosure:
- Do you currently use a similar app, and which
- Would you want a share link visible to a partner, advisor or therapist
- Roughly how organised do you feel most weeks (a simple scale, not a diagnostic)

**Consent covers:** what is collected; that journal content is never shared with the AI
assistant; where data is stored (Supabase, EU region); how to request deletion and how
fast we will do it. Worded to hold up regardless of which country a tester is in — which
in practice means writing it to the stricter standard (GDPR) and applying it to everyone.

### One thing to check this week

If any of this is presented as **research** — in a class, a paper, or a conference —
Georgetown's IRB may need to review it first, and retroactive approval is generally not
available. For a product pilot it is usually out of scope, but the combination of human
subjects, optional mental-health context and a university affiliation is exactly the shape
that gets asked about.

**Ask the question before recruiting starts, not after.** Dr. Zafari or Dr. Lyon would
know who to ask.

---

## Outreach list

| Who | Why them | Ask |
| --- | --- | --- |
| Georgetown wellness / counselling services | The closest thing to a real buyer, on campus | Would they review the platform, or introduce us to providers who would? |
| Dr. Babak Zafari | Faculty, analytics | Advice on the pilot design and what the data can honestly support |
| Dr. Gregory Lyon | Faculty | Survey design and research-ethics steer, including the IRB question |
| Dr. Tommy Jones | Faculty | *Confirm the ask before sending — what specifically do we want from him?* |
| 10–12 therapists and coaches | The buyer we have not met | 20 minutes: what do you ask clients between sessions, and what do they actually bring back? |

**Do not pitch in the first conversation.** Ask what they do now. A provider describing
their own workaround is worth more than a provider politely agreeing with ours.

---

## The two months, roughly

| Window | The work |
| --- | --- |
| 7–11 Sept | Nomination in. Positioning decided. Pilot ready to launch |
| 13–22 Sept | Testers onboarding. First provider conversations. **Application submitted** |
| 23 Sept – 10 Oct | Pilot running. Weekly numbers. Fix what testers hit |
| 10 Oct | Mid-pilot read. Is the share link being used? Adjust if not |
| 11–24 Oct | Pilot continues. Provider conversations become a price |
| 25–31 Oct | Collection closed. Analysis. Deck built on real numbers |
| 3 Nov | **Mandatory rehearsal**, with final figures |
| 4–9 Nov | Rehearse. Tighten. Prepare for questions |
| 10 Nov | **Finals** |

---

## What could go wrong, and what we would do

**Nobody creates a share link.** The most likely bad outcome, and the most useful. It would
mean the wedge is wrong, and we would have found out in October rather than in front of
judges. We would pivot the pitch to the consumer app and say plainly what we learned.

**No provider will talk to us.** Then the clinical framing is unsupported and we lead
consumer. Decide this by 10 October, not in November.

**Testers sign up and never return.** Then the daily loop is not as good as we think, and
we should say so. A team that reports honest retention and explains what it is changing is
more credible than one presenting a number nobody believes.

**We run out of time on the tech.** Acceptable. Nothing on the roadmap changes our odds as
much as one clinician's sentence does.
