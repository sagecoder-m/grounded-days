# How grounded makes money

Two revenue lines, one of which leads. Costs live in the
[team & running costs](https://claude.ai/code/artifact/72a7c4cc-0f4d-4880-aa41-f59e97e083f7)
document; this is the other half.

- **Prepared:** 6 September 2026
- **Artifact:** https://claude.ai/code/artifact/e5fa3c67-c92b-4036-b998-12de972ad00d

> **Read every price here as a hypothesis.** No pricing exists in the product and nobody has
> paid us anything. The arithmetic is sound; the prices are guesses until the pilot returns
> metric 6 — a price a provider does not flinch at.

---

## The answer in one paragraph

> A practice pays us per clinician. Every client that clinician invites gets grounded free,
> forever — that is how we acquire consumers without paying for them. Clients who arrive on
> their own pay for features. **Never for privacy, and never for telling us anything about
> their brain.**

---

## The two lines

### B2B2C — the practice pays *(leads)*

**Who buys.** Therapy practices, group clinics, coaching practices and university wellness
offices. The budget holder is practice operations, not an individual therapist's
discretionary spending — that distinction is the difference between a $1,788 line item and
an impossible sell.

**What they buy.** The clinician surface: a roster of clients who have chosen to share, and
a short pre-session read of what each client wrote about their week.

**What it costs them.** A per-clinician seat. $149/month is the number to test first — it
works out at roughly $12 per client for a caseload of 25, which sits inside the range
comparable between-session tools occupy.

**What the client pays.** Nothing, ever. Not a trial, not a freemium tier that later closes.
A client who leaves that practice keeps the app.

### B2C — the individual pays for capability *(follows)*

**Who buys.** Someone who found grounded on their own and wants more of it. No clinician, no
code, no disclosure of anything.

**What stays free forever.** The whole core: tasks, habits, goals, the calendar, the journal,
handwriting, and share links. **Opening the app is never gated** — least of all on the return
after a hard few weeks, which is the moment the entire product exists to protect.

**What is paid** — capability, priced per capability:

- More than one connected calendar account
- Unlimited handwritten pages and their storage
- Export — PDF and CSV of everything you have written
- Assistant use beyond a monthly allowance *(the one line with real marginal cost — about a cent a message)*

**Price.** $4.99–7.99/month, or $40–48/year. Annual is the better fit: the honest usage
pattern is episodic — someone reaches for this when a term gets hard or a move goes badly —
and monthly billing punishes exactly the people who use it the way it is designed to be used.

---

## Why B2B2C leads, in one division

| | |
| --- | --- |
| Monthly burn to cover | **$6,170** (funded team, from the cost model) |
| Clinician seats at $149 | **42** — roughly 14 practices of three |
| Or consumers at $7.99 | **773** — for exactly the same money |

**Forty-two conversations, or seven hundred and seventy-three.** Fourteen practices is a list
you can write on one page and work through by hand. Seven hundred paying consumers is not
reachable in a year without paid acquisition, and paid acquisition in consumer wellness is
where this category buries companies.

That is the entire strategic argument, and it is one division. It is also why the consumer
app is not a second bet — it is the distribution mechanism for the first.

**Say it as a sequence, never as an "and."** Present two businesses and a judge picks one,
usually the harder-to-fund one, and scores you on it.

---

## How the two lines feed each other

**Practice → client, at zero cost.** One clinician seat brings 20–30 client seats. We pay
nothing to acquire any of them, and they arrive with a reason to open the app that we did not
have to manufacture: someone they trust asked them to.

**Client → practice, as inbound.** A B2C user who starts therapy has a reason to show
grounded to their new therapist. That therapist is a lead we did not source. This is the half
we have **not** measured, and it should be presented as a hypothesis, not a flywheel.

**Departure does not churn.** A client who leaves a practice keeps free access for the life
of the account. That is a deliberate cost: losing the app because you left a therapist is
precisely the harm this product exists to avoid. It also means a practice churning does not
take its clients' goodwill with it.

---

## Unit economics

| Line | Value | Note |
| --- | --- | --- |
| One clinician seat | $1,788/yr | $149 × 12 |
| A three-clinician practice | $5,364/yr | The realistic first account |
| A 25-client caseload, per client | $12/mo | Inside the $8–15 comparable range |
| Marginal cost of a client seat | cents | Database rows and image storage. A handwritten page a day is roughly 100MB a year; a thousand users stay inside a Supabase Pro allowance |
| Marginal cost of assistant use | ~$0.009/msg | **The one cost that scales with engagement** — every other line is flat. On Claude Haiku 4.5 ($1/M in, $5/M out), counted from the real payload: roughly a cent a message. At moderate use across break-even caseloads that is **6% of revenue**; at heavy use, **23%**. Derivation in the cost model |

Gross margin on a clinician seat is very high — ordinary SaaS economics, and not the
interesting part. The interesting part is that **client seats cost us almost nothing and are
the acquisition channel**, which is why giving them away is a business decision rather than a
charitable one.

**The allowance is a margin control, not a sales tactic.** The assistant is the only cost in
the model that rises with how much someone uses grounded. At moderate use it takes 6% of
revenue and nobody notices; at heavy use it takes 23%. An allowance is what keeps a good week
from being expensive — and it is the reason the B2C paid tier prices assistant use at all.

---

## Comparables

**Verify the flagged rows before either goes in front of a judge.** The cost of quoting a
number we have not checked is the whole answer, not just that line.

| What | Roughly | Why it matters | Status |
| --- | --- | --- | --- |
| Practice-management software, per clinician | $29–99/mo | The system of record — scheduling, notes, billing, claims. We would be supplementary to it and priced above it. **This is the objection to prepare for** | Verify |
| Between-session client tools, per client | $8–15/mo | The range our per-seat maths must live inside | Researched |
| Consumer planner / wellness subscriptions | $3–8/mo | Sets the ceiling on the B2C line | Verify |
| Executive-function or ADHD coaching | $100–200/hr | An interesting frame — but it argues for a far higher price than $7.99, so do not use both claims in one pitch | Verify |

---

## What we will not charge for, and why it is in the financial model

- **Re-entry.** No paywall, no trial countdown, no expiry banner between someone and their
  own data. If billing lapses, premium surfaces go read-only and everything already written
  stays visible and exportable. Gating the return after a lapse would break the one promise
  the product is built on.
- **Privacy.** "No AI reads your journal" is not a premium tier. It is true for every
  account, free ones included. Selling it would make it a luxury and make us a company that
  charges the vulnerable for a guarantee it gives the wealthy.
- **Disclosure.** We do not ask anyone to name a condition, and we never make the free tier
  conditional on doing so. Pricing a disclosure is financial inducement to hand over health
  data — which under GDPR is unlikely to count as freely given consent, and which contradicts
  the product's own rule that it identifies patterns and never labels.
- **Data.** We do not sell it, license it, or build a commercial asset out of it. There is no
  line for this in the model because there will never be one.
- **Advertising.** An attention-funded model and a product designed to be opened *less* often
  on a bad week cannot coexist.

*These belong in a financial document because each is revenue deliberately declined. A judge
asking "why not just charge for that?" should get an answer that was decided in advance, not
improvised.*

---

## What the pilot has to return before any of this is real

**A price.** What a provider does not flinch at. Three conversations, written up. Until then
the honest answer to "what do you charge" is *"we are testing it, and here is what three
providers told us."*

**Whether anyone shares at all.** Share links created, by real testers. If people use the app
daily and never share, the B2B2C wedge is wrong and the whole model above needs rebuilding.
**This is the most valuable thing the pilot can tell us, including if the answer is
unwelcome.**

**Consumer willingness to pay.** Would testers pay for the four paid capabilities, and which
one do they name first? The answer sets the B2C price and tells us whether that line is worth
building at all this year.

---

## The ask follows from the burn

Twelve months of the funded team is $77,800; six months is $40,780. The derivation, and how
the three uses of money sum to the total, is in the cost model.

**Check the competition's prize before fixing the number.** A university award is usually
well below $78,000, and asking for a figure the competition cannot grant reads as not having
read the rules.
