# Clinical layer — what we build before the 13th

A decision for the three of us, not a plan already made. The clinical layer spec
(`GROUNDED_CLINICAL_LAYER_SPEC.md`) describes seven phases of work. We have seven days
before testers arrive. This document lays out the options so we can choose deliberately
rather than by default.

- **Prepared:** 6 September 2026
- **Decide by:** Wednesday 10 September
- **Companion documents:** [Introduction](./01-introduction.md) · [Application prep](./02-application-prep.md) · [Pitch](./03-pitch.md)

---

## The constraint

| | |
| --- | --- |
| Testing opens | **13 September** — 7 days |
| Application closes | **22 September** — 16 days |
| Finals | 10 November |
| Spec as written | 7 phases, 5 new tables, RLS policies, a consent flow, a new dashboard |

The spec is good. It is also more work than the calendar allows, and the question is not
whether to build it but in what order and how much before the pilot starts.

> Our own introduction document says the bottleneck is evidence — users, a buyer, and a
> price — and names building instead of proving as *"the most comfortable mistake
> available to us."* That sentence was written for exactly this decision.

---

## Three options

### Option A — Build the spec in order

All seven phases, as written: access model, data model, consent, check-in, clinician
dashboard, onboarding, assistant.

**For it.** The spec is coherent and sequenced, and building it in order means never
retrofitting. If a provider conversation goes well in week two, we have something to show
them immediately. It is also the most satisfying option, which is worth naming.

**Against it.** It cannot be done in seven days, so testing either starts without the
onboarding work or starts late. It builds the clinician side before any clinician has said
they want it, which risks building the wrong dashboard. And it puts a surface that receives
client health data into production during a 30-person pilot, before the business-associate
question at the bottom of the spec is settled.

### Option B — Evidence-first slice *(recommended)*

Build **§6** and a modified **§2** now. Defer **§1**, **§3**, **§5** until a provider asks
for them.

**§6, needs-based onboarding — build as specced.** Our introduction document already names
onboarding-for-someone-who-is-not-the-founder as thin. Thirty people arrive on the 13th.
One screen, multi-select, mapping into defaults that already exist.

**§2, the weekly check-in — build it, unbundled from the clinician link.** As specced it
only appears for clinician-linked accounts that have opted into sharing, which means during
a pilot with no clinicians it never fires once. Remove that one condition and it becomes
the pilot's own instrument: a 0–10 week rating and one line, weekly, from 30 people.

That is a first honest outcome signal, and it is the thing slide 6 of the pitch exists to
carry and currently has nothing in it. Same build, one condition removed, paying from the
13th instead of in November.

**For it.** Everything built serves the pilot. Nothing is built for a buyer we have not
met. The check-in becomes reusable later for the clinical layer without rework, because the
mirror rule and the skip semantics are the same either way.

**Against it.** If a provider conversation in week two goes unusually well, we have no
dashboard to show. We would show them the existing share link and a check-in history, which
is less impressive. This is a real cost and we should decide it is acceptable rather than
discover it.

### Option C — Build nothing new; pilot on what exists

Freeze features. Run the pilot on the product as it stands, fix only what testers hit.

**For it.** The most disciplined reading of "the bottleneck is not engineering." Zero risk
of shipping a bug to 30 new people in week one. All three of us on evidence.

**Against it.** Onboarding is the one thing we already know is thin, and the pilot's first
failure mode is testers who sign up, can't find their footing, and never return. Freezing
means accepting that risk on the one surface every tester meets first. And we would have no
outcome measure at all — only usage.

---

## The three side by side

| | **A · Full spec** | **B · Evidence-first** | **C · Freeze** |
| --- | --- | --- | --- |
| Ready by 13 Sept | No | Yes | Yes |
| Onboarding fixed before testers arrive | Partly, phase 6 of 7 | **Yes** | No |
| Outcome signal from the pilot | Only if a clinician joins | **Yes, from every tester** | None |
| Something to show a provider in week 2 | Yes | Share link + check-in history | Share link only |
| Risk of building the wrong dashboard | High | None yet | None |
| Compliance exposure during the pilot | Live | None | None |
| Engineering load on Jack | Very high | Moderate | Low |

**Recommendation: B.** Not because the clinical layer is wrong — it is the right product —
but because every hour of it before a provider conversation is an hour spent on a guess,
and two of the seven phases pay off in seven days.

---

## Who does what

The split changed: Jack reviews the backend rather than building it, and Mulanga implements by
prompting Claude with Jack's review. **The roles, and the capacity problem that split creates,
are in [the introduction](./01-introduction.md)** — this document stays about what gets built.

What Option B means in practice: **Mulanga** builds §6 onboarding and §2 check-in unbundled
from the clinician link, plus the admin console surfacing what is already measured. **Jack**
reviews each of those before it meets testers — data model, RLS, and the journal-isolation
boundary above all. **Kamillah** writes the check-in wording and defines a return visit before
anything is instrumented against it.

## Corrections that apply whichever option we pick

Six things in the spec are wrong about the codebase or contradict themselves. These need
fixing in the document before anyone builds from it.

| # | What the spec says | What is actually true |
| --- | --- | --- |
| 1 | "Next.js on Vercel" | **TanStack Start + TanStack Router.** Flat route files in `src/routes/`. `/profile/sharing` is `profile.sharing.tsx`; `/clinician` is `clinician.tsx` |
| 2 | The check-in week follows the account's week-start setting | `Settings.weekStartsOn` exists, but `src/lib/user-insights.ts` hardcodes `weekStartsOn: 1`. A Sunday account would get a check-in week that does not match the signals bundled with it. **Fix the hardcode first** |
| 3 | Bundle the "Consistency, over time" picture | It is a Recharts line chart of habits-completed-per-day over 21 days. Not a value — you cannot snapshot a component into `jsonb`. Snapshot the daily counts and re-render |
| 4 | `account_access.tier` is `'clinician_linked' \| 'general'` | §1.1 defines a third account type and §5 gates a route to it. There is nothing to gate on. The existing `admin_emails` pattern — RLS with zero policies — is the right model |
| 5 | Acceptance criterion 4: preview "byte-identical" to what the dashboard renders | The dashboard renders 8–12 weeks and a sparkline; the preview shows one week. Test the **payload**: assert the `derived` snapshot the preview displayed equals the row the dashboard reads |
| 6 | `clinician_links` holds one `sharing_opted_in_at` per pair | A client who shares, revokes, then shares again overwrites it, and every week from the first episode becomes permanently unreadable. Either state that as intended or use an append-only `sharing_episodes` table |

---

## Three questions the spec does not answer

These are design decisions, not bugs. Each needs someone to choose.

### 1. Who computes "worth asking about"?

§5.1 puts a flag on the caseload row. §5.2 and §8 both forbid interpretation, trend
analysis and AI summary. Any rule we write — low rating, two quiet weeks, rising waiting
items — is trend interpretation delivered to a clinician about something the client never
previewed.

**Proposed resolution:** it means *the client wrote something in field 4.* Client-authored,
inside the mirror preview by construction, and more useful than any threshold we would
invent — the client is telling the therapist what to ask about.

**Decide:** Mulanga, with the first provider we speak to.

### 2. Does habit consistency go to the clinician at all?

§1 says nothing may display a gap or a miss. The consistency chart plots zero for a day
with no habits completed. That is fine on your own Personal page — it was chosen
deliberately, and the code comment explains why. It is a different thing on a therapist's
screen: a flat row of zeros for a hard week is a bad week made visible, in front of exactly
the person the product exists to protect it from.

**Options:** cut habit consistency from the shared bundle; send only "finished this week"
counts; or keep it and accept the tension knowingly.

**Decide:** all three of us. This one goes to the heart of the product's premise and should
not be settled by whoever writes the query.

### 3. Is the check-in card too present?

§2.1 puts a persistent card at the top of Overview all week until answered. It is
explicitly not a modal and does not escalate, which is right. But it does mean that on a
bad day the first thing on screen is an unanswered survey.

**Options:** leave it; allow dismiss-for-today without recording an answer; or move it
below the first widget row.

**Decide:** Kamillah, from what testers say in week one.

---

## What is already built, and does not need building

Worth knowing before anyone estimates: two of the six pilot metrics are already instrumented.

- **Cohort retention exists.** `src/components/hq-retention.tsx` and
  `src/lib/hq-analytics.ts` do signup-week cohorts, count "active" as any deliberate action
  excluding `page_view`, and leave future weeks blank rather than printing 0%. **Metric 2 is
  measured.**
- **Share-link creation is instrumented.** `share_link_create` and `share_link_copy` are in
  the telemetry allowlist, with a note explaining why there is deliberately no
  `share_link_open`. **Metric 3 is measured.**

What remains is surfacing both in the admin console. That is smaller than a build.

---

## One thing that is not negotiable in any option

The telemetry allowlist in `src/lib/telemetry.ts` is 14 event names plus the route, and
`track()` has no payload parameter at all. The comment above it says why:

> *"a future call site cannot quietly attach a task title; the temptation has no door."*

Any feature that needs dwell time, per-task interaction traces or app-open timestamps
requires opening that door. If we ever consider it, it is a whole-team decision with the
reasoning written down — not a line added to an allowlist.

---

## Bugs on the list

| What | Status | Note |
| --- | --- | --- |
| Calendar reverted to light on open, in dark mode | **Fixed** — `4595bd0` | DayFlow resolves event colours in JavaScript from a theme mode it keeps internally, defaulting to light. We only told it in a `useEffect`, which runs *after* the first paint, so every mount painted a frame of light chips. Now set on the constructor via `theme: { mode }`, with the effect kept for a live toggle |
| Overview page across phone, tablet and desktop | Open | **The one bug that is also a pilot risk** — the first screen every tester meets, on whatever device they own. Needs scoping before it can be estimated. Worth fixing before the 13th even under Option C |

## Two more for discussion

Both are covered in full in [the introduction](./01-introduction.md) under "What we are
actually deciding" — decisions 2 and 4. The short versions:

**The clinician / therapist point of view.** The pitch can lead clinician-first immediately and
costs nothing to build. The clinician *surface* is §1, §3 and §5 — still deferred until a
provider says what they want. Pitch where we are going; demo what exists.

**Modernising the look.** Safe to change craft (type, spacing, motion, contrast); not safe to
change semantics (no scores, streaks or red states). Scope now, do it 25–31 October when the
deck is being built.

## Decisions needed, and by when

| By | Decision | Who |
| --- | --- | --- |
| **Mon 8 Sept** | Option A, B or C | All three |
| **Mon 8 Sept** | Who takes the scheduling half of provider outreach | All three |
| **Mon 8 Sept** | Scope the Overview breakpoint work — which device, which surface, what "fixed" means | Mulanga + Jack |
| **Tue 9 Sept** | Pitch leads clinician-first — yes or no | Mulanga |
| **Tue 9 Sept** | Habit consistency in the shared bundle — yes, no, or reduced | All three |
| **Tue 9 Sept** | Check-in wording, all four fields | Kamillah |
| **Tue 9 Sept** | Definition of a return visit | Kamillah, then Jack instruments |
| **Wed 10 Sept** | Clinical-first vs consumer-first positioning | Mulanga |
| **Wed 10 Sept** | Spec corrections folded in before anyone builds from it | Jack |
| After first provider call | "Worth asking about," and whether §5 is the dashboard they want | Mulanga |
| Late October | Visual modernisation — scoped now, done in the 25–31 Oct window | All three |
