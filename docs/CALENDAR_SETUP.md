# Calendar sync setup

One-time setup to make Google Calendar and Outlook import work. Nothing here
costs money.

The code is already in place; until these steps are done, the Connect buttons on
Profile will fail because the provider credentials do not exist.

## 0. Install the Supabase CLI

Not installed on this machine. Needed to apply the migration and deploy the
functions.

```bash
brew install supabase/tap/supabase
```

Then log in (opens a browser) and link the project:

```bash
supabase login
supabase link --project-ref pbjpypcdiwvxegewxleu
```

## 1. The one redirect URI

Both providers redirect to the same place. Register this exact value in both:

```
https://pbjpypcdiwvxegewxleu.supabase.co/functions/v1/calendar-oauth-callback
```

## 2. Azure (Outlook)

1. <https://portal.azure.com> → **Microsoft Entra ID** → **App registrations** →
   **New registration**
2. Name it anything (e.g. `Grounded Days`)
3. **Supported account types**: *Accounts in any organizational directory and
   personal Microsoft accounts* — this is what lets both a
   progressionstate.com account and a personal outlook.com account connect
4. **Redirect URI**: platform **Web**, value from step 1
5. Register, then copy the **Application (client) ID**
6. **Certificates & secrets** → **New client secret** → copy the *Value*
   (shown once)
7. **API permissions** → **Add a permission** → **Microsoft Graph** →
   **Delegated** → add `Calendars.Read` and `offline_access`

If the tenant requires admin consent for `Calendars.Read`, grant it with
**Grant admin consent** on that same page — you are likely the admin.

## 3. Google Calendar

1. <https://console.cloud.google.com> → create a project
2. **APIs & Services** → **Library** → enable **Google Calendar API**
3. **OAuth consent screen** → External → fill in the required fields → add your
   own Google account under **Test users**
4. **Credentials** → **Create credentials** → **OAuth client ID** →
   **Web application**
5. **Authorized redirect URIs**: value from step 1
6. Copy the **Client ID** and **Client secret**

### The Google catch, in plain terms

`calendar.readonly` is a *sensitive* scope. While the consent screen is in
**Testing**, Google expires refresh tokens after **7 days** — so Google sync
will stop roughly weekly and the connection will show *needs reconnecting* on
Profile. That state is built into the UI on purpose; it is expected, not a bug.

To stop it happening, either publish the app and pass Google's verification
review, or accept the weekly reconnect. Outlook has no equivalent limit, which
is why it is worth connecting first.

## 4. Set the secrets

None of these belong in the repo — it is public.

```bash
supabase secrets set \
  GOOGLE_CLIENT_ID=... \
  GOOGLE_CLIENT_SECRET=... \
  MICROSOFT_CLIENT_ID=... \
  MICROSOFT_CLIENT_SECRET=... \
  APP_BASE_URL=https://grounded-days.vercel.app
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

## 5. Apply the migration and deploy

> Already done as of 2026-08-23: the migrations are applied, all four functions
> are deployed, and APP_BASE_URL is set. What remains is steps 2-4 — the Google
> and Azure registrations and their four secrets. Nothing will connect until
> those exist.

```bash
supabase db push
supabase functions deploy calendar-oauth-start calendar-oauth-callback calendar-sync
```

`calendar-oauth-callback` is reached by the browser from the provider, with no
Supabase JWT attached, so it must not require one:

```bash
supabase functions deploy calendar-oauth-callback --no-verify-jwt
```

## 6. Regenerate the database types

`src/integrations/supabase/types.ts` was hand-edited to match this migration so
the app would typecheck before the migration existed. Replace it with the real
generated file once the migration is applied:

```bash
supabase gen types typescript --linked > src/integrations/supabase/types.ts
```

## 7. Try it

Open Profile → **Connect Outlook Calendar**, approve, and you should land back
on Profile with events importing. Repeat for Google.

## Optional: sync on a schedule

Sync currently only runs when you press **Sync now**. To run it hourly, in the
Supabase SQL editor:

```sql
select cron.schedule(
  'calendar-sync-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://pbjpypcdiwvxegewxleu.supabase.co/functions/v1/calendar-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

This needs the `pg_cron` and `pg_net` extensions enabled (Database →
Extensions), and the service role key available to the cron job — set it once
with `alter database postgres set app.service_role_key = '...'`.

Unverified: whether this cron traffic counts as activity for Supabase's
free-tier 7-day auto-pause. If it does, it also keeps the project awake as a
side effect — but do not rely on that until it has actually been observed.
