# Read-only share links

Lets someone without an account see a chosen slice of your Grounded data.

## How it is kept safe

Three properties do the work. If you change this feature, keep all three.

**The anon role has no table access.** A share is served entirely by the
`share-view` edge function using the service role. An anonymous visitor cannot
query `tasks`, `goals`, `events` or anything else — they can only call one
endpoint that decides field by field what leaves the database. There is no RLS
policy anywhere granting `anon` a read, and adding one would undo this.

**Only a hash of the token is stored.** The raw token exists in the URL and
nowhere else; `share_links.token_hash` holds its SHA-256. A dump of the table
yields no working links. The consequence is that a link can be shown to its
creator exactly once, at creation — there is no "show link again" because the
server genuinely cannot reconstruct it.

**Every query is scoped by area.** The link records which of Personal /
Professional / Education it covers, and each query filters on both `user_id` and
that area list. Habits have no area column and belong to Personal, so they are
only included when the link covers Personal. Events with no area appear only on
a link covering all three, because an unlabelled event on a Professional-only
link could just as easily be a medical appointment.

Descriptions and notes are excluded from every collection. Titles and progress
convey the shape of things without the private detail people write in a
description field.

## What a viewer sees

Goals with progress bars, upcoming tasks and events for the next 60 days, and
habit names — for the shared areas only. No editing, no navigation into the rest
of the app, no sign-in prompt.

Expired, revoked and never-existed links are indistinguishable: all three answer
404 and show the same message. Distinguishing them would let someone with a dead
link learn whether it was ever real.

## Deploying

`share-view` must be deployed without JWT verification, because a share viewer
has no Supabase session:

```bash
supabase functions deploy share-view --no-verify-jwt
```

Then apply the migration:

```bash
supabase db push
```

## Route notes

The token travels as `?t=…` rather than in the path, so a single route serves
every link. That was originally to keep the page statically hostable; it stays
because it means no route-parameter plumbing and no reason for the token to
appear in a path segment.

`/share` is listed in `PUBLIC_PATHS` in `src/components/app-gate.tsx` and
short-circuits the gate before the session check — it must render with no
session and no app chrome, even when the owner is signed in on the same device.

## Not yet verified

The valid-token path has never been exercised: the function is not deployed and
no link has been created, so the only tested states are "no token" and
"link not available". Expect the first real share to need a fix.
