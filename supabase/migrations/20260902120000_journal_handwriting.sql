-- Handwritten journal entries.
--
-- A day's entry can now be typed, handwritten, or both. The handwriting is
-- stored as an image in its own bucket and the row keeps the path.
--
-- Not stored as stroke data, which was the other option. Strokes would be
-- smaller, replayable and editable later — and they would also mean this app
-- owning a rendering format forever, where an image is readable by anything,
-- including whatever someone exports their journal into in five years. A
-- journal is a thing people keep; the boring durable format wins.
alter table public.journal_entries
  add column if not exists ink_path text;

comment on column public.journal_entries.ink_path is
  'Storage path of a handwritten page in the journal-ink bucket, or null when the entry is typed.';

-- The bucket. Private, like assistant-uploads — a journal is the most private
-- thing in this app, and the only reason its images are not simply blocked
-- outright is that the person who wrote them has to be able to read them back.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'journal-ink',
  'journal-ink',
  false,
  -- A page of handwriting as a PNG is tens of kilobytes. This is a backstop
  -- against something going wrong in the export, not the expected size.
  5242880, -- 5 MiB
  array['image/png']
)
on conflict (id) do nothing;

-- Same shape as the assistant bucket's policies: the first folder segment is
-- the owner's uid, which is what scopes every row to one person.
drop policy if exists "Users can upload their own journal ink" on storage.objects;
create policy "Users can upload their own journal ink"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'journal-ink'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can view their own journal ink" on storage.objects;
create policy "Users can view their own journal ink"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'journal-ink'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can replace their own journal ink" on storage.objects;
create policy "Users can replace their own journal ink"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'journal-ink'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete their own journal ink" on storage.objects;
create policy "Users can delete their own journal ink"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'journal-ink'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
