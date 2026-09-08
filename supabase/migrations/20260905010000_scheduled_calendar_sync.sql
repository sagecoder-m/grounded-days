-- The schedule the sync function was written for, which never existed.
--
-- calendar-sync already has two modes: called with a user's JWT it syncs that
-- user, and called with the service role it syncs everyone. The comment in the
-- function says "(the schedule) syncs everything" — but nothing was ever
-- scheduled, so in practice a calendar only updated when somebody happened to
-- open the app. Leave it a week and every calendar is a week stale, which is
-- most of what "it stops working when I don't use it" describes.
--
-- The second thing this buys is that the project stays awake. A free-tier
-- Supabase project pauses after a stretch with no activity, and a paused
-- project is why signing in returns "Failed to fetch" out of nowhere. An hourly
-- request is not a supported anti-pause mechanism and should not be treated as
-- one — the real fix is a paid plan — but it does keep an otherwise idle
-- project ticking over.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Its own schema, reachable by nobody. The function below runs as its definer
-- and can read the service role key, so it must not be callable by a signed-in
-- user: that would hand any account a way to make authenticated calls as root.
create schema if not exists ops;
revoke all on schema ops from public;
revoke all on schema ops from anon, authenticated;

/*
  Calls the sync endpoint as the service role.

  The key comes from Vault rather than being written here. A migration is a file
  in the repository; a service role key in one is a service role key in every
  clone of it, forever, and rotating it then means rewriting history. Vault
  keeps it in the database, encrypted, and out of git entirely.

  Missing secrets are a notice rather than an error on purpose: a fresh clone or
  a local stack has no vault entries, and a cron job that raises every hour on a
  developer's machine is noise that teaches people to ignore cron errors.
*/
create or replace function ops.run_calendar_sync()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  service_key text;
  project_url text;
begin
  select decrypted_secret into service_key
  from vault.decrypted_secrets where name = 'service_role_key';

  select decrypted_secret into project_url
  from vault.decrypted_secrets where name = 'project_url';

  if service_key is null or project_url is null then
    raise notice 'calendar sync skipped: vault is missing service_role_key or project_url';
    return;
  end if;

  perform net.http_post(
    url := project_url || '/functions/v1/calendar-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end;
$$;

revoke all on function ops.run_calendar_sync() from public;
revoke all on function ops.run_calendar_sync() from anon, authenticated;

-- Hourly, at 17 past. Not on the hour: every scheduled job in the world runs at
-- :00, and the provider APIs this eventually calls are busiest then.
select cron.unschedule('calendar-sync-hourly')
where exists (select 1 from cron.job where jobname = 'calendar-sync-hourly');

select cron.schedule(
  'calendar-sync-hourly',
  '17 * * * *',
  $$select ops.run_calendar_sync()$$
);
