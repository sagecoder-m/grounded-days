-- Storage for images sent to the assistant — a syllabus photo, a screenshot
-- of a schedule, a handwritten list.
--
-- The first bucket this app has needed. The image itself never touches the
-- assistant_messages table (see the previous migration's `attachments`
-- column) — Postgres rows are not where a few megabytes of photo belongs,
-- and a chat history table that grows by a photo's worth per message is a
-- backup and a query plan someone regrets later. Storage is built for this;
-- the table just remembers the path.
--
-- Private, not public: nothing here is a photo id or an avatar meant to be
-- linkable by anyone who has the URL. Each person can only reach their own
-- folder, enforced the same way every other table in this app is — RLS,
-- keyed to auth.uid() — because storage.objects is a table too, not a
-- separate security model.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'assistant-uploads',
  'assistant-uploads',
  false,
  -- The client compresses before uploading (see the composer), so this is a
  -- backstop against something slipping past that, not the expected size.
  8388608, -- 8 MiB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
);

-- Path convention every policy below assumes: "<user_id>/<uuid>.<ext>". The
-- first path segment is the owner, checked the same way as every other
-- owner-scoped policy in this app.
create policy "Users can upload their own assistant images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'assistant-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can view their own assistant images"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'assistant-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- No update policy: an uploaded image is replaced by uploading a new one
-- under a new id, never edited in place — same reasoning as assistant
-- messages themselves being insert-and-delete-only, never updatable.

create policy "Users can delete their own assistant images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'assistant-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
