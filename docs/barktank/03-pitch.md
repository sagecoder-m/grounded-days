# grounded — the pitch

Built on the wedge-and-expansion framing: lead clinical, expand to consumer. Numbers in
`[brackets]` are blanks the pilot fills. **Do not present a bracket.** If a number is not
there by rehearsal, cut the claim rather than soften it.

- **Prepared:** 5 September 2026
- **Finals:** 10 November · **Rehearsal:** 3 November
- **Open decision:** positioning, to be settled by 10 September — see
  [application prep](./02-application-prep.md)

---

## Before the slides

**Time.** Assume a short pitch and a longer Q&A, and that the Q&A is where this is won.
Build for four minutes of speaking and rehearse to three and a half.

**The one thing they should remember.** Not "a calm planner." This:

> People are asked how their week went and cannot remember. grounded is what they hand
> over instead.

**The risk to manage.** The room has funded B2B companies. If we sound like a consumer
habit app, we are compared to Finch and to Notion and we lose. The buyer has to appear by
slide three.

---

## 1 · The question nobody can answer

> "So — how was your week?"

Every therapist, coach and advisor opens with it. Almost nobody can answer it.

What actually gets reported is the last two days, filtered through how the person feels
right now. A hard Tuesday disappears. A good fortnight gets described as a bad one because
this morning was bad.

**Speaker note:** open on the question, not on the product. Let it sit for a beat. Most of
the room has been on one side of that conversation.

---

## 2 · Why the existing tools make it worse

The obvious fix is a habit tracker. It is the wrong fix.

Every one of them is built on streaks, scores and completion percentages. Which means the
week someone most needs support is the week their app shows a broken streak and 38%
completion — and that is the week they stop opening it, and the week they have least to
bring to the person trying to help.

**The tools quit on people exactly when the people need them.**

**Speaker note:** this is the insight the pitch rests on. Say it slowly. Do not name
competitors — describe the mechanic and let the room supply the names.

---

## 3 · grounded

A daily place to keep your life — personal, professional, study — built on a subtraction.

No streaks. No scores. **Nothing counted that is absent.**

Six finished things is six finished things, not 60% of ten.

And then the part that is actually the product: **a summary you can hand to someone
helping you** — a therapist, a coach, an advisor — that shows where support would help
without making anyone feel caught.

**Speaker note:** three sentences, then move. The demo does the explaining.

---

## 4 · Demo — 60 seconds, two screens

**Screen one, the client.** Today's list. Add a thing. Open the journal and write a line
with an Apple Pencil on ruled paper. *Say:* "This is the half people use daily."

**Screen two, the shared summary.** Open a real share link. Read the sentences out loud —
they are generated, not written:

> "Over the last 8 weeks, 41 things were finished, across Personal, Professional and
> Education — most of it in Professional."
> "Professional has 7 things waiting past their date — usually the most useful place to
> start a conversation."

*Say:* "Waiting. Never overdue. The work is waiting; the person is not failing. That
distinction is tested in our codebase — a future change cannot quietly reintroduce shaming
language."

**Speaker note:** the second screen is the pitch. Spend forty of the sixty seconds there.
Use a real account, not a mock. Have a recording ready in case the wifi fails.

---

## 5 · Who pays

**Therapists, coaches, and university wellness offices.** They have the problem acutely,
they have a budget, and they already ask clients to track things between sessions — usually
on paper that never comes back.

They pay per client seat. Every client they bring gets the consumer app.

**That is how we acquire consumers without paying for them.**

**Speaker note:** the sequence is the point — first market, then the second, with a reason
the second follows. Do not present them as two businesses.

---

## 6 · What we have learned

`[N]` testers across `[k]` countries. `[X]%` still using it in week two.
`[S]` share links created.

`[Q]` provider conversations. `[P]` said they would use it with clients.

> `[The clinician quote — one sentence, attributed by role, not name]`

**Speaker note:** this is the slide the whole pilot exists to fill. If the retention number
is unflattering, show it and say what we changed. A team that reports an honest number is
more credible than one presenting a number the room does not believe.

---

## 7 · Built to be trusted, not just to promise it

This matters more here than in most products, and it is checkable:

- **The journal never reaches the AI.** Enforced by an explicit deny list in code, beside
  the allowlist, so adding a table later cannot quietly include it.
- **Secrets are sealed at the database.** Four tables — OAuth tokens, passcode hashes —
  have row-level security with *no policy at all*, so no client query can reach them ever.
- **Share links store a hash, not the token.** A database dump does not yield a working
  link. Expired, revoked and never-existed all answer identically.

**Speaker note:** one slide, thirty seconds. In a room that funded a cybersecurity company,
this buys credibility disproportionate to its length. Do not read all the bullets — pick
the deny list and move.

---

## 8 · The market, honestly

Two numbers, not a triangle.

- Roughly `[N]` licensed therapists and counsellors in the US, plus campus wellness offices
  at `[N]` institutions
- At `[$X]` per client seat, a single practice of 25 clients is a `[$Y]` annual account

**We are not claiming a share of the wellness-app market.** We are claiming a tool that
sits inside an existing relationship that already exists in its millions.

**Speaker note:** resist the enormous-TAM slide. This room has seen a thousand of them.
A small, defensible number is more persuasive than a large invented one.

---

## 9 · Why us

**It already exists.** Deployed, syncing real calendars, in daily use. Not a prototype
built for this competition.

**Built at Georgetown, tested at Georgetown, and beyond it** — `[k]` countries in the
pilot.

**Kamillah Ismail** runs the pilot — `[one line: what makes her credible at it]`.
**Jack Hamilton** oversees the technology — `[one line: what makes him credible at it]`.

**Speaker note:** working software is a real differentiator here. Say it plainly once and
do not labour it.

---

## 10 · What the money does

Not "runway." Three specific things:

1. **`[$]` — the pilot becomes a paid pilot.** Two or three practices, real invoices, and a
   price we have tested rather than guessed.
2. **`[$]` — the provider side becomes a real product.** Today a provider gets a link. They
   need a place to hold several clients.
3. **`[$]` — the security review.** A Namibian firm, scoped at the boundary that keeps one
   person's journal out of another's account, before we hold anyone's clinical-adjacent data
   at scale.

**Speaker note:** point three lands well in this room and is true — it is already budgeted.

---

## 11 · The ask

`[$X]` to turn `[N]` testers and `[Q]` provider conversations into `[3]` paying practices
by `[month]`.

**Speaker note:** end on the number and stop talking. Do not thank the room into a
trailing-off silence.

---

## Questions we will get

Full answers in [application prep](./02-application-prep.md). The compressed versions:

**"Who pays, how much?"** A practice, per client seat. Comparable tools run $8–15 per client
per month. We are testing willingness to pay in the pilot rather than guessing.

**"Crowded category."** Habit trackers are crowded. Non-shaming shared records are not. The
sharing half is the product.

**"HIPAA? Medical device?"** Neither. A personal journal its owner may choose to share
through a revocable link. No diagnosis, no treatment recommendation, not a covered entity,
and the provider's own notes never enter our system.

**"What have you proven?"** Say the real numbers, then name the gap: no revenue yet, and
that is what the pilot and this funding are for.

---

## Rehearsal notes

- **Rehearse the Q&A more than the pitch.** The pitch is four minutes we control; the
  questions are where it is decided.
- **Practise saying "we don't know yet."** Followed by how we will find out. It is a
  stronger answer than a confident guess, and this room can tell the difference.
- **Have the demo on a device, and a recording as a fallback.** Do not rely on the venue's
  wifi to reach a live app.
- **Cut every bracket that is still empty by 3 November.** A claim without a number is
  worse than no claim.
